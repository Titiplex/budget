import {describe, expect, it} from 'vitest'
import {BUDGET_BACKUP_KIND} from '../../utils/jsonBackup'
import {
    createBudgetBackupSnapshotWithImportData,
    parseBudgetBackupWithImportData,
    serializeBudgetBackupWithImportData,
} from '../../utils/importJsonBackup'
import {createRestoreDryRunReport} from '../../utils/restoreDryRun'
import {verifyBackupIntegrityManifest} from '../../utils/backupIntegrity'
import type {BudgetBackupWithGoalsSnapshot} from '../../utils/goalsJsonBackup'

function baseGoalsSnapshot(): BudgetBackupWithGoalsSnapshot {
    return {
        kind: BUDGET_BACKUP_KIND,
        version: 5,
        exportedAt: '2026-05-03T12:00:00.000Z',
        data: {
            accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
            categories: [{id: 1, name: 'Food', kind: 'EXPENSE', color: null, description: null}],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [{id: 1, label: 'Coffee', amount: 4.5, sourceAmount: null, sourceCurrency: null, conversionMode: 'NONE', exchangeRate: 1, exchangeProvider: 'ACCOUNT', exchangeDate: '2026-05-01', kind: 'EXPENSE', date: '2026-05-01', note: null, accountId: 1, categoryId: 1}],
            taxProfiles: [],
            financialGoals: [],
            projectionScenarios: [],
            projectionSettings: null,
        },
    }
}

function serializedBackup() {
    return serializeBudgetBackupWithImportData(createBudgetBackupSnapshotWithImportData(baseGoalsSnapshot()))
}

describe('backup integrity manifest', () => {
    it('adds integrity metadata to new backups and verifies it on parse', () => {
        const content = serializedBackup()
        const raw = JSON.parse(content)

        expect(raw.integrity).toMatchObject({
            version: 1,
            formatVersion: 6,
            algorithm: 'stable-json-fnv1a32-v1',
        })
        expect(raw.integrity.sections).toEqual(expect.arrayContaining(['accounts', 'transactions', 'importBackup']))
        expect(raw.integrity.counts.accounts).toBe(1)
        expect(raw.integrity.sectionChecksums.accounts).toMatch(/^stable-json-fnv1a32-v1:/)
        expect(raw.integrity.checksum).toMatch(/^stable-json-fnv1a32-v1:/)

        const parsed = parseBudgetBackupWithImportData(content)
        expect(parsed.integrityVerification).toMatchObject({status: 'valid', ok: true, errors: []})

        const report = createRestoreDryRunReport(parsed)
        expect(report.canApply).toBe(true)
        expect(report.integrity?.status).toBe('valid')
        expect(report.warnings).toContain('Intégrité backup vérifiée : manifeste et checksums valides.')
    })

    it('detects a modified backup through global and section checksums', () => {
        const raw = JSON.parse(serializedBackup())
        raw.data.accounts[0].name = 'Modified account'

        const parsed = parseBudgetBackupWithImportData(JSON.stringify(raw))
        expect(parsed.integrityVerification?.status).toBe('invalid')
        expect(parsed.integrityVerification?.errors.join('\n')).toContain('Checksum global invalide')
        expect(parsed.integrityVerification?.errors.join('\n')).toContain('Checksum invalide pour data.accounts')

        const report = createRestoreDryRunReport(parsed)
        expect(report.canApply).toBe(false)
        expect(report.blockingErrors.join('\n')).toContain('Checksum global invalide')
    })

    it('detects a deleted section and inconsistent section counts', () => {
        const raw = JSON.parse(serializedBackup())
        delete raw.data.transactions

        const verification = verifyBackupIntegrityManifest(raw)
        expect(verification.status).toBe('invalid')
        expect(verification.errors.join('\n')).toContain('Section data.transactions absente du backup')
        expect(verification.errors.join('\n')).toContain('Checksum global invalide')
    })

    it('keeps legacy backups without manifest restorable but clearly reported', () => {
        const legacy = JSON.stringify(baseGoalsSnapshot())
        const parsed = parseBudgetBackupWithImportData(legacy)

        expect(parsed.integrityVerification).toMatchObject({status: 'legacy', ok: true})
        expect(parsed.integrityVerification?.warnings.join('\n')).toContain('Checksum manquant')

        const report = createRestoreDryRunReport(parsed)
        expect(report.canApply).toBe(true)
        expect(report.integrity?.status).toBe('legacy')
        expect(report.warnings.join('\n')).toContain('backup legacy sans manifeste')
    })
})
