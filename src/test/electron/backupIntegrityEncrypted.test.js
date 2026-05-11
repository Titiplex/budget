import {describe, expect, it} from 'vitest'
import {withBackupIntegrityManifest} from '../../utils/backupIntegrity'
import {parseBudgetBackupWithImportData} from '../../utils/importJsonBackup'
import {createRestoreDryRunReport} from '../../utils/restoreDryRun'

function loadBackupEncryption() {
    return require('../../../electron/security/backupEncryption')
}

function backupJsonWithManifest() {
    return JSON.stringify(withBackupIntegrityManifest({
        kind: 'budget-backup',
        version: 6,
        exportedAt: '2026-05-03T12:00:00.000Z',
        data: {
            accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
            categories: [],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [],
            taxProfiles: [],
            financialGoals: [],
            projectionScenarios: [],
            projectionSettings: null,
            importBackup: {
                schemaVersion: 1,
                documentation: {included: [], excluded: [], notes: []},
                mappingTemplates: [],
                importSources: [],
                importHistory: [],
                metadata: {
                    exportedAt: '2026-05-03T12:00:00.000Z',
                    auditOnlyRestore: true,
                    financialDataNotRestoredFromImportHistory: true,
                },
            },
        },
    }), null, 2)
}

describe('encrypted backup integrity', () => {
    it('keeps manifest verification valid after decrypting an encrypted backup', () => {
        const {decryptBackupJson, encryptBackupJson} = loadBackupEncryption()
        const password = 'unit-test-password'
        const envelope = encryptBackupJson(backupJsonWithManifest(), password, {
            now: () => new Date('2026-05-03T12:00:00.000Z'),
            metadata: {backupVersion: 6},
        })

        const decryptedJson = decryptBackupJson(envelope, password)
        const parsed = parseBudgetBackupWithImportData(decryptedJson)
        const report = createRestoreDryRunReport(parsed)

        expect(parsed.integrityVerification?.status).toBe('valid')
        expect(report.canApply).toBe(true)
        expect(report.integrity?.ok).toBe(true)
    })
})
