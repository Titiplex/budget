import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'

const fixtureDir = path.join(process.cwd(), 'src/test/fixtures/security')

function readFixture(name) {
    return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

function readJsonFixture(name) {
    return JSON.parse(readFixture(name))
}

describe('security and trust fixtures', () => {
    it('keeps the valid backup fixture parseable by the restore parser', async () => {
        const {parseBudgetBackupWithImportData} = await import('../../utils/importJsonBackup')
        const {createRestoreDryRunReport} = await import('../../utils/restoreDryRun')

        const parsed = parseBudgetBackupWithImportData(readFixture('valid-backup-v6.json'))
        const report = createRestoreDryRunReport(parsed)

        expect(parsed.version).toBe(6)
        expect(parsed.data.accounts).toHaveLength(1)
        expect(report.canApply).toBe(true)
        expect(report.blockingErrors).toEqual([])
    })

    it('keeps the legacy backup fixture restorable through compatibility parsing', async () => {
        const {parseBudgetBackupWithImportData} = await import('../../utils/importJsonBackup')
        const {createRestoreDryRunReport} = await import('../../utils/restoreDryRun')

        const parsed = parseBudgetBackupWithImportData(readFixture('legacy-backup-v2.json'))
        const report = createRestoreDryRunReport(parsed)

        expect(parsed.version).toBe(6)
        expect(report.canApply).toBe(true)
        expect(report.integrity?.status).toBe('legacy')
    })

    it('keeps the corrupted backup fixture rejected before restore', async () => {
        const {parseBudgetBackupWithImportData} = await import('../../utils/importJsonBackup')

        expect(() => parseBudgetBackupWithImportData(readFixture('corrupted-backup.json')))
            .toThrow(/JSON est invalide|corrompu/i)
    })

    it('generates an encrypted fixture from the valid backup and rejects wrong passwords', () => {
        const {
            BACKUP_ENCRYPTION_ERROR_CODES,
            decryptBackupJson,
            encryptBackupJson,
            parseEncryptedBackup,
            serializeEncryptedBackup,
        } = require('../../../electron/security/backupEncryption')
        const backupJson = readFixture('valid-backup-v6.json')

        const envelope = encryptBackupJson(backupJson, 'fixture-password', {
            now: () => new Date('2026-05-11T12:00:00.000Z'),
            metadata: {source: 'fixture-test', backupVersion: 6},
        })
        const serialized = serializeEncryptedBackup(envelope)
        const parsed = parseEncryptedBackup(serialized)

        expect(JSON.stringify(parsed)).not.toContain('Fixture Checking')
        expect(JSON.stringify(parsed)).not.toContain('fixture-password')
        expect(JSON.parse(decryptBackupJson(parsed, 'fixture-password'))).toEqual(JSON.parse(backupJson))
        expect(() => decryptBackupJson(parsed, 'bad-password')).toThrow(expect.objectContaining({
            code: BACKUP_ENCRYPTION_ERROR_CODES.WRONG_PASSWORD,
        }))
    })

    it('documents an incoherent database fixture for integrity checks', () => {
        const fixture = readJsonFixture('incoherent-database.json')

        expect(fixture.accounts[0].currency).toBe('CA')
        expect(fixture.transactions.some((transaction) => transaction.accountId === 99)).toBe(true)
        expect(fixture.budgetTargets[0].categoryId).toBe(99)
        expect(fixture.recurringTransactionTemplate[0].intervalCount).toBe(0)
    })
})
