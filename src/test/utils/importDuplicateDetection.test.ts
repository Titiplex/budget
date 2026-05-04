import {describe, expect, it} from 'vitest'
import {
    ImportDeduplicationStrategy,
    ImportRowStatus,
    ImportTargetEntityType,
    ImportType,
} from '../../types/imports'
import type {ImportRowNormalized} from '../../types/imports'
import {
    buildImportNormalizedFingerprint,
    detectImportDuplicateCandidates,
    hashImportNormalizedRow,
    importRowToDuplicateReference,
} from '../../utils/importDuplicateDetection'
import {buildImportDryRunPreview} from '../../utils/importPreviewService'

function row(overrides: Partial<ImportRowNormalized> = {}): ImportRowNormalized {
    return {
        id: overrides.id ?? `row-${overrides.rowNumber ?? 1}`,
        rowNumber: overrides.rowNumber ?? 1,
        rawRowId: overrides.rawRowId ?? `raw-${overrides.rowNumber ?? 1}`,
        status: overrides.status ?? ImportRowStatus.Valid,
        targetKind: overrides.targetKind ?? ImportTargetEntityType.Transaction,
        normalizedData: overrides.normalizedData ?? {
            date: '2026-05-01T00:00:00.000Z',
            label: 'Coffee shop downtown',
            amount: -4.5,
            currency: 'CAD',
            accountName: 'Main account',
        },
        transactionDate: overrides.transactionDate ?? '2026-05-01T00:00:00.000Z',
        label: overrides.label ?? 'Coffee shop downtown',
        amount: overrides.amount ?? -4.5,
        currency: overrides.currency ?? 'CAD',
        accountName: overrides.accountName ?? 'Main account',
        externalRef: overrides.externalRef ?? null,
        duplicateKey: overrides.duplicateKey ?? null,
        duplicateConfidence: overrides.duplicateConfidence ?? null,
        validationErrors: overrides.validationErrors ?? [],
        duplicateCandidates: overrides.duplicateCandidates ?? [],
    }
}

describe('importDuplicateDetection', () => {
    it('builds a stable normalized hash and exact duplicate candidate', () => {
        const imported = row({id: 'incoming-1'})
        const reference = importRowToDuplicateReference(imported, 42)
        const result = detectImportDuplicateCandidates([imported], [reference])

        expect(buildImportNormalizedFingerprint(imported)).toMatchObject({
            date: '2026-05-01',
            amount: -4.5,
            currency: 'CAD',
            label: 'coffee shop downtown',
        })
        expect(hashImportNormalizedRow(imported)).toBe(reference.normalizedHash)
        expect(result.exactDuplicates).toHaveLength(1)
        expect(result.rows[0]).toMatchObject({matchKind: 'exactDuplicate', confidence: 1})
        expect(result.candidates[0]).toMatchObject({
            entityId: 42,
            strategy: ImportDeduplicationStrategy.Strict,
            source: 'normalizedHash',
        })
    })

    it('detects repeated imports of the same file as exact duplicates', () => {
        const imported = row({id: 'incoming-1'})
        const reference = {
            ...importRowToDuplicateReference(imported, 99),
            normalizedHash: null,
            fileHash: 'file-a',
        }

        const result = detectImportDuplicateCandidates([imported], [reference], {repeatedFileHash: 'file-a'})

        expect(result.exactDuplicates).toHaveLength(1)
        expect(result.candidates[0]).toMatchObject({
            entityId: 99,
            matchKind: 'exactDuplicate',
            source: 'previousBatch',
        })
    })

    it('detects fuzzy duplicates despite minor label differences', () => {
        const incoming = row({
            id: 'incoming-1',
            label: 'Coffee shop downtown card 1234',
            normalizedData: {
                date: '2026-05-01T00:00:00.000Z',
                label: 'Coffee shop downtown card 1234',
                amount: -4.5,
                currency: 'CAD',
                accountName: 'Main account',
            },
        })
        const reference = {
            id: 12,
            entityType: ImportTargetEntityType.Transaction,
            date: '2026-05-01',
            amount: -4.5,
            currency: 'CAD',
            accountName: 'Main account',
            label: 'COFFEE SHOP DOWNTOWN',
            snapshot: {id: 12, label: 'COFFEE SHOP DOWNTOWN'},
        }

        const result = detectImportDuplicateCandidates([incoming], [reference])

        expect(result.rows[0].matchKind).toBe('probableDuplicate')
        expect(result.rows[0].confidence).toBeGreaterThanOrEqual(result.thresholds.probable)
        expect(result.probableDuplicates[0]).toMatchObject({
            entityId: 12,
            strategy: ImportDeduplicationStrategy.Fuzzy,
        })
    })

    it('keeps false positives below the weak threshold', () => {
        const incoming = row({id: 'incoming-1'})
        const reference = {
            id: 55,
            entityType: ImportTargetEntityType.Transaction,
            date: '2026-05-10',
            amount: -250,
            currency: 'USD',
            accountName: 'Other account',
            label: 'Monthly rent',
            snapshot: {id: 55, label: 'Monthly rent'},
        }

        const result = detectImportDuplicateCandidates([incoming], [reference])

        expect(result.candidates).toHaveLength(0)
        expect(result.rows[0]).toMatchObject({matchKind: 'notDuplicate', confidence: 0})
    })

    it('detects weak collisions for ambiguous rows using configurable thresholds', () => {
        const incoming = row({
            id: 'incoming-1',
            label: 'Coffee shop',
            normalizedData: {
                date: '2026-05-01T00:00:00.000Z',
                label: 'Coffee shop',
                amount: -4.5,
                currency: 'CAD',
                accountName: 'Main account',
            },
        })
        const reference = {
            id: 77,
            entityType: ImportTargetEntityType.Transaction,
            date: '2026-05-02',
            amount: -4.52,
            currency: 'CAD',
            accountName: 'Main account',
            label: 'Cafe downtown',
            snapshot: {id: 77},
        }

        const result = detectImportDuplicateCandidates([incoming], [reference], {
            thresholds: {probable: 0.9, weak: 0.45},
        })

        expect(result.rows[0].matchKind).toBe('weakCollision')
        expect(result.weakCollisions).toHaveLength(1)
    })

    it('detects same-batch duplicates before application', () => {
        const first = row({id: 'row-1', rowNumber: 1})
        const second = row({id: 'row-2', rowNumber: 2})

        const result = detectImportDuplicateCandidates([first, second], [])

        expect(result.rows[0].matchKind).toBe('notDuplicate')
        expect(result.rows[1].matchKind).toBe('exactDuplicate')
        expect(result.rows[1].candidates[0]).toMatchObject({entityId: 'row-1'})
    })

    it('exposes duplicate candidates to the dry-run preview', async () => {
        const incoming = row({id: 'incoming-1'})
        const reference = importRowToDuplicateReference(incoming, 123)
        const detection = detectImportDuplicateCandidates([incoming], [reference])
        const preview = await buildImportDryRunPreview({
            rows: detection.rowsWithCandidates,
            template: {id: 'tpl-1', name: 'Bank CSV', importType: ImportType.Transactions, sourceType: 'csvFile' as never},
            targetAccountId: 1,
            defaultCurrency: 'CAD',
        })

        expect(preview.rows[0].duplicateCandidates).toHaveLength(1)
        expect(preview.rows[0].action).toBe('updateTransaction')
        expect(preview.rows[0].targetEntityId).toBe(123)
        expect(preview.stats.duplicateCount).toBe(1)
        expect(preview.stats.updateTransactionRows).toBe(1)
    })
})
