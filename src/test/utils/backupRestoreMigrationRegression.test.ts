import {createRequire} from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'

import {parseBudgetBackupWithImportData, serializeBudgetBackupWithImportData} from '../../utils/importJsonBackup'
import {createRestoreDryRunReport, markRecoveryBackupCreated} from '../../utils/restoreDryRun'
import {
    brokenReferencesBackup,
    brokenReferencesDryRunSnapshot,
    cloneFixture,
    completeValidBackup,
    invalidJsonBackup,
    invalidVersionBackup,
    legacySupportedBackup,
    minimalValidBackup,
    unknownDataBackup,
} from '../fixtures/backupRestoreFixtures'

const require = createRequire(import.meta.url)
const {resolveDatabasePathForApp} = require('../../../electron/db/resolveDatabasePath')

const tempDirs: string[] = []

function makeTempDir(label: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `budget-${label}-`))
    tempDirs.push(dir)
    return dir
}

function writeFileEnsuringDir(filePath: string, content: string) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true})
    fs.writeFileSync(filePath, content, 'utf8')
}

afterEach(() => {
    while (tempDirs.length) {
        const dir = tempDirs.pop()
        if (dir) fs.rmSync(dir, {recursive: true, force: true})
    }
})

describe('backup, restore and migration regression gates', () => {
    it('exports a complete backup with integrity metadata and validates a clean restore dry-run', () => {
        const serialized = serializeBudgetBackupWithImportData(cloneFixture(completeValidBackup))
        const raw = JSON.parse(serialized)

        expect(raw).toMatchObject({
            kind: 'budget-backup',
            version: 6,
            integrity: {
                version: 1,
                formatVersion: 6,
                algorithm: 'stable-json-fnv1a32-v1',
            },
        })
        expect(raw.integrity.sections).toEqual(expect.arrayContaining([
            'accounts',
            'transactions',
            'financialGoals',
            'projectionScenarios',
            'importBackup',
        ]))

        const parsed = parseBudgetBackupWithImportData(serialized)
        const report = createRestoreDryRunReport(parsed)

        expect(parsed.integrityVerification).toMatchObject({ok: true, status: 'valid'})
        expect(report.canApply).toBe(true)
        expect(report.blockingErrors).toEqual([])
        expect(report.counts).toMatchObject({
            accountsToCreate: 3,
            categoriesToCreate: 3,
            budgetTargetsToCreate: 1,
            recurringTemplatesToCreate: 1,
            transactionsToCreate: 4,
            taxProfilesToCreate: 1,
            financialGoalsToCreate: 2,
            projectionScenariosToCreate: 1,
            importMappingTemplatesToRestore: 1,
            importHistoryItemsToRestore: 1,
        })
        expect(report.warnings.join('\n')).toContain('Intégrité backup vérifiée')
        expect(report.warnings.join('\n')).toContain('audit-only')
    })

    it('restores minimal and legacy backups with deterministic defaults for newer domains', () => {
        const minimal = parseBudgetBackupWithImportData(JSON.stringify(minimalValidBackup))
        const legacy = parseBudgetBackupWithImportData(JSON.stringify(legacySupportedBackup))

        expect(createRestoreDryRunReport(minimal).canApply).toBe(true)
        expect(minimal.data.financialGoals).toEqual([])
        expect(minimal.data.projectionScenarios).toEqual([])
        expect(minimal.data.importBackup.importHistory).toEqual([])

        expect(legacy.version).toBe(6)
        expect(legacy.data.financialGoals).toEqual([])
        expect(legacy.data.projectionScenarios).toEqual([])
        expect(legacy.data.projectionSettings).toBeNull()
        expect(legacy.data.importBackup).toMatchObject({
            schemaVersion: 1,
            metadata: {
                auditOnlyRestore: true,
                financialDataNotRestoredFromImportHistory: true,
            },
        })
        expect(createRestoreDryRunReport(legacy).canApply).toBe(true)
    })

    it('refuses corrupted, unsupported and dangling-reference backups before restore', () => {
        expect(() => parseBudgetBackupWithImportData(invalidJsonBackup)).toThrow('JSON est invalide')
        expect(() => parseBudgetBackupWithImportData(invalidVersionBackup)).toThrow('Version de backup JSON non supportée')
        expect(() => parseBudgetBackupWithImportData(brokenReferencesBackup)).toThrow('référence un compte absent')

        const report = createRestoreDryRunReport(brokenReferencesDryRunSnapshot)

        expect(report.canApply).toBe(false)
        expect(report.blockingErrors.join('\n')).toContain('Transaction "Salaire mai" référence un compte absent (404)')
        expect(report.blockingErrors.join('\n')).toContain('Transaction "Salaire mai" référence une catégorie absente (405)')
    })

    it('keeps dry-run read-only and marks the pre-restore backup only after explicit confirmation', () => {
        const currentState = {
            accounts: [{id: 999, name: 'Existing user account'}],
            categories: [{id: 998, name: 'Existing user category'}],
            transactions: [{id: 997, label: 'Existing user transaction'}],
        }
        const before = cloneFixture(currentState)
        const parsed = parseBudgetBackupWithImportData(serializeBudgetBackupWithImportData(cloneFixture(completeValidBackup)))

        const report = createRestoreDryRunReport(parsed, currentState)

        expect(currentState).toEqual(before)
        expect(report.recovery).toEqual({
            preRestoreBackupRequired: true,
            createdBeforeWrite: false,
            path: null,
        })
        expect(report.counts.existingAccountsToReplace).toBe(1)
        expect(report.counts.existingCategoriesToReplace).toBe(1)
        expect(report.counts.existingTransactionsToReplace).toBe(1)

        const marked = markRecoveryBackupCreated(report, '/tmp/pre-restore-backup.json')
        expect(marked.recovery).toMatchObject({
            preRestoreBackupRequired: true,
            createdBeforeWrite: true,
            path: '/tmp/pre-restore-backup.json',
        })
    })

    it('ignores unknown future backup sections without losing supported goals and import audit data', () => {
        const parsed = parseBudgetBackupWithImportData(unknownDataBackup)
        const report = createRestoreDryRunReport(parsed)

        expect(report.canApply).toBe(true)
        expect(parsed.data.financialGoals).toHaveLength(2)
        expect(parsed.data.projectionScenarios).toHaveLength(1)
        expect(parsed.data.importBackup.importHistory).toHaveLength(1)
        expect((parsed.data as Record<string, unknown>).wealthBackup).toBeUndefined()
        expect((parsed.data as Record<string, unknown>).securityAudit).toBeUndefined()
        expect(report.counts.importHistoryItemsToRestore).toBe(1)
    })

    it('does not replace an existing packaged user database and seeds only missing or empty DB files', () => {
        const root = makeTempDir('packaged-db')
        const appPath = path.join(root, 'app')
        const userDataPath = path.join(root, 'user-data')
        const templatePath = path.join(appPath, 'assets', 'database', 'app.db')
        const dbPath = path.join(userDataPath, 'data', 'app.db')
        const appApi = {
            isPackaged: true,
            getPath: (name: string) => {
                expect(name).toBe('userData')
                return userDataPath
            },
            getAppPath: () => appPath,
        }

        writeFileEnsuringDir(templatePath, 'template-db-v2')
        writeFileEnsuringDir(dbPath, 'user-db-v1')

        expect(resolveDatabasePathForApp(appApi)).toBe(dbPath)
        expect(fs.readFileSync(dbPath, 'utf8')).toBe('user-db-v1')

        fs.rmSync(dbPath, {force: true})
        expect(resolveDatabasePathForApp(appApi)).toBe(dbPath)
        expect(fs.readFileSync(dbPath, 'utf8')).toBe('template-db-v2')

        fs.writeFileSync(dbPath, '')
        expect(resolveDatabasePathForApp(appApi)).toBe(dbPath)
        expect(fs.readFileSync(dbPath, 'utf8')).toBe('template-db-v2')
    })

    it('keeps the critical local-first schema and packaged DB build surface under regression tests', () => {
        const schema = fs.readFileSync(path.resolve('prisma/schema.prisma'), 'utf8')
        const buildPackagedDbScript = fs.readFileSync(path.resolve('scripts/build-packaged-db.js'), 'utf8')
        const resolver = fs.readFileSync(path.resolve('electron/db/resolveDatabasePath.js'), 'utf8')

        for (const modelName of [
            'Account',
            'Category',
            'Transaction',
            'BudgetTarget',
            'RecurringTransactionTemplate',
            'Asset',
            'Portfolio',
            'Liability',
            'NetWorthSnapshot',
            'FinancialGoal',
            'ProjectionScenario',
            'ImportBatch',
            'ImportReconciliationDecision',
        ]) {
            expect(schema).toContain(`model ${modelName}`)
        }

        expect(schema).toContain('datasource db')
        expect(schema).toContain('provider = "sqlite"')
        expect(buildPackagedDbScript).toContain('prisma')
        expect(buildPackagedDbScript).toContain('db')
        expect(buildPackagedDbScript).toContain('push')
        expect(buildPackagedDbScript).toContain('DATABASE_URL')
        expect(resolver).toContain('shouldSeedPackagedDatabase')
        expect(resolver).toContain('fs.statSync(dbPath).size === 0')
    })
})
