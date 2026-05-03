import {describe, expect, it, vi} from 'vitest'
import {
    ImportDeduplicationStrategy,
    ImportErrorSeverity,
    ImportErrorStage,
    ImportRowStatus,
    ImportTargetEntityType,
    ImportType,
} from '../../types/imports'
import type {ImportRowNormalized} from '../../types/imports'
import {parseCsvImport} from '../../utils/importCsvEngine'
import {assertDryRunReadModel, buildImportDryRunPreview} from '../../utils/importPreviewService'

function transactionRow(overrides: Partial<ImportRowNormalized> = {}): ImportRowNormalized {
    return {
        id: overrides.id ?? `row-${overrides.rowNumber ?? 1}`,
        rowNumber: overrides.rowNumber ?? 1,
        rawRowId: overrides.rawRowId ?? `raw-${overrides.rowNumber ?? 1}`,
        status: overrides.status ?? ImportRowStatus.Valid,
        targetKind: overrides.targetKind ?? ImportTargetEntityType.Transaction,
        normalizedData: overrides.normalizedData ?? {
            date: '2026-05-01T00:00:00.000Z',
            label: 'Coffee',
            amount: -4.5,
            currency: 'CAD',
        },
        transactionDate: overrides.transactionDate ?? '2026-05-01T00:00:00.000Z',
        label: overrides.label ?? 'Coffee',
        amount: overrides.amount ?? -4.5,
        currency: overrides.currency ?? 'CAD',
        accountName: overrides.accountName ?? 'Main',
        duplicateKey: overrides.duplicateKey ?? null,
        duplicateConfidence: overrides.duplicateConfidence ?? null,
        validationErrors: overrides.validationErrors ?? [],
        duplicateCandidates: overrides.duplicateCandidates ?? [],
    }
}

describe('importPreviewService', () => {
    it('builds a dry-run preview from parsed CSV without writing anything', async () => {
        const parsed = parseCsvImport([
            'Date,Description,Amount,Currency,Account',
            '2026-05-01,Coffee,-4.50,CAD,Main',
            'bad-date,Broken,abc,CAD,Main',
        ].join('\n'))
        const readModel = {
            findDuplicateCandidates: vi.fn().mockResolvedValue([]),
            findConflicts: vi.fn().mockResolvedValue([]),
            createTransaction: vi.fn(),
            updateTransaction: vi.fn(),
        }

        const preview = await buildImportDryRunPreview({
            parsedFile: parsed.preview,
            template: {id: 'tpl-1', name: 'Bank CSV', importType: ImportType.Transactions, sourceType: 'csvFile' as never},
            targetAccountId: 1,
            defaultCurrency: 'CAD',
            readModel,
        })

        expect(preview.dryRun).toBe(true)
        expect(preview.rows).toHaveLength(2)
        expect(preview.rows[0].action).toBe('createTransaction')
        expect(preview.rows[1].action).toBe('skip')
        expect(preview.stats).toMatchObject({
            totalRows: 2,
            createTransactionRows: 1,
            skippedRows: 1,
            invalidRows: 1,
        })
        expect(readModel.findDuplicateCandidates).toHaveBeenCalled()
        expect(readModel.findConflicts).toHaveBeenCalled()
        expect(readModel.createTransaction).not.toHaveBeenCalled()
        expect(readModel.updateTransaction).not.toHaveBeenCalled()
    })

    it('marks probable duplicates as needsReview while exact transaction duplicates plan an update', async () => {
        const rows = [
            transactionRow({
                id: 'row-probable',
                rowNumber: 1,
                duplicateCandidates: [{
                    normalizedRowId: 'row-probable',
                    entityType: ImportTargetEntityType.Transaction,
                    entityId: 10,
                    confidence: 0.75,
                    strategy: ImportDeduplicationStrategy.Fuzzy,
                    reason: 'Similar date and amount',
                    matchFields: ['date', 'amount'],
                }],
            }),
            transactionRow({
                id: 'row-exact',
                rowNumber: 2,
                duplicateCandidates: [{
                    normalizedRowId: 'row-exact',
                    entityType: ImportTargetEntityType.Transaction,
                    entityId: 11,
                    confidence: 0.99,
                    strategy: ImportDeduplicationStrategy.Strict,
                    reason: 'Exact duplicate key',
                    matchFields: ['date', 'amount', 'label'],
                }],
            }),
        ]

        const preview = await buildImportDryRunPreview({
            rows,
            template: {id: 'tpl-1', name: 'Bank CSV', importType: ImportType.Transactions, sourceType: 'csvFile' as never},
            targetAccountId: 1,
            defaultCurrency: 'CAD',
        })

        expect(preview.rows[0].action).toBe('needsReview')
        expect(preview.rows[0].reviewRequired).toBe(true)
        expect(preview.rows[1].action).toBe('updateTransaction')
        expect(preview.rows[1].targetEntityId).toBe(11)
        expect(preview.stats).toMatchObject({
            duplicateCount: 2,
            needsReviewRows: 1,
            updateTransactionRows: 1,
        })
    })

    it('marks conflicts and missing target data as needsReview with readable reasons', async () => {
        const preview = await buildImportDryRunPreview({
            rows: [
                transactionRow({
                    rowNumber: 1,
                    accountName: null,
                    normalizedData: {
                        date: '2026-05-01T00:00:00.000Z',
                        label: 'Coffee',
                        amount: -4.5,
                        currency: 'CAD',
                    },
                }),
            ],
            template: {id: 'tpl-1', name: 'Bank CSV', importType: ImportType.Transactions, sourceType: 'csvFile' as never},
            defaultCurrency: 'CAD',
            readModel: {
                findConflicts: vi.fn().mockResolvedValue([{code: 'accountClosed', message: 'Le compte cible semble fermé.', field: 'accountId'}]),
            },
        })

        expect(preview.rows[0].action).toBe('needsReview')
        expect(preview.rows[0].missingFields).toContain('targetAccountOrAccountName')
        expect(preview.rows[0].conflicts[0]).toMatchObject({code: 'accountClosed'})
        expect(preview.rows[0].reasons.join(' ')).toContain('Données manquantes')
        expect(preview.stats).toMatchObject({
            needsReviewRows: 1,
            conflictCount: 1,
            missingDataCount: 1,
        })
    })

    it('plans investment-like rows as asset operations', async () => {
        const preview = await buildImportDryRunPreview({
            rows: [
                transactionRow({
                    rowNumber: 1,
                    targetKind: ImportTargetEntityType.InvestmentMovement,
                    normalizedData: {
                        date: '2026-05-03T00:00:00.000Z',
                        operationType: 'BUY',
                        symbol: 'XEQT',
                        quantity: 10,
                        unitPrice: 32.5,
                        currency: 'CAD',
                    },
                    amount: null,
                }),
            ],
            template: {id: 'tpl-invest', name: 'Broker CSV', importType: ImportType.Investments, sourceType: 'csvFile' as never},
            targetPortfolioId: 5,
            defaultCurrency: 'CAD',
        })

        expect(preview.rows[0].action).toBe('createAssetOperation')
        expect(preview.rows[0].targetEntityType).toBe(ImportTargetEntityType.InvestmentMovement)
        expect(preview.stats).toMatchObject({createAssetOperationRows: 1, needsReviewRows: 0})
    })

    it('reports unsafe read models exposing write methods', () => {
        expect(assertDryRunReadModel({findDuplicateCandidates: () => [], createTransaction: () => undefined}))
            .toMatchObject({safe: false, forbiddenMethods: ['createTransaction']})
        expect(assertDryRunReadModel({findDuplicateCandidates: () => []}))
            .toMatchObject({safe: true})
    })

    it('keeps understandable row warnings in the preview', async () => {
        const warning = {
            rowNumber: 1,
            stage: ImportErrorStage.Validation,
            severity: ImportErrorSeverity.Warning,
            code: 'DEFAULT_CURRENCY_USED',
            message: 'Currency missing; defaulted to CAD.',
            field: 'currency',
        }
        const preview = await buildImportDryRunPreview({
            rows: [transactionRow({validationErrors: [warning]})],
            template: {id: 'tpl-1', name: 'Bank CSV', importType: ImportType.Transactions, sourceType: 'csvFile' as never},
            targetAccountId: 1,
            defaultCurrency: 'CAD',
        })

        expect(preview.rows[0].warnings).toEqual([warning])
        expect(preview.rows[0].reasons).toContain('Currency missing; defaulted to CAD.')
        expect(preview.stats.warningCount).toBe(1)
    })
})
