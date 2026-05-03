import {describe, expect, it} from 'vitest'
import {BUDGET_BACKUP_KIND} from '../../utils/jsonBackup'
import {
    backupImportDocumentationMarkdown,
    createBudgetBackupSnapshotWithImportData,
    IMPORT_BACKUP_FORMAT_VERSION,
    parseBudgetBackupWithImportData,
    serializeBudgetBackupWithImportData,
} from '../../utils/importJsonBackup'
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

const userTemplate = {
    id: 'user-template-1',
    name: 'My broker template',
    sourceType: 'csvFile',
    importType: 'investments',
    provider: 'custom',
    delimiter: ',',
    hasHeader: true,
    defaultCurrency: 'CAD',
    dateFormat: 'auto',
    decimalSeparator: 'auto',
    deduplicationStrategy: 'externalReference',
    isSystem: false,
    columnMappings: [
        {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
        {sourceColumn: 'Amount', targetField: 'amount', fieldType: 'number', required: true},
    ],
    defaultValues: {},
    metadata: {copiedFromPresetId: 'system:csv:preset:broker-transactions'},
}

const systemTemplate = {...userTemplate, id: 'system:csv:preset:broker-transactions', isSystem: true}

const importBatch = {
    id: 'batch-1',
    status: 'applied',
    importType: 'transactions',
    provider: 'bank-a',
    fileName: 'bank-a.csv',
    fileHash: 'hash-1',
    rowCount: 1,
    errorCount: 0,
    warningCount: 0,
    duplicateCount: 0,
    importedAt: '2026-05-03T10:00:00.000Z',
    rawRows: [{id: 'raw-1', rowNumber: 2}],
    normalizedRows: [{id: 'row-1', rowNumber: 2, normalizedData: {label: 'Coffee'}}],
    errors: [],
    warnings: [],
    duplicateCandidates: [],
    decisions: [{id: 'decision-1', batchId: 'batch-1', normalizedRowId: 'row-1', kind: 'importAsNew'}],
    appliedLinks: [{batchId: 'batch-1', normalizedRowId: 'row-1', operation: 'created', transactionId: 1}],
}

describe('import JSON backup extension', () => {
    it('serializes and parses import templates and audit history in backup version 6', () => {
        const snapshot = createBudgetBackupSnapshotWithImportData(baseGoalsSnapshot(), {
            mappingTemplates: [userTemplate as any, systemTemplate as any],
            importSources: ['bank-a', 'bank-a', 'broker-b'],
            importHistory: [importBatch],
        })

        expect(snapshot.version).toBe(IMPORT_BACKUP_FORMAT_VERSION)
        expect(snapshot.data.importBackup.mappingTemplates).toEqual([expect.objectContaining({id: 'user-template-1', isSystem: false})])
        expect(snapshot.data.importBackup.importSources).toEqual(['bank-a', 'broker-b'])
        expect(snapshot.data.importBackup.importHistory[0]).toMatchObject({id: 'batch-1', decisions: [expect.objectContaining({kind: 'importAsNew'})]})
        expect(snapshot.data.importBackup.documentation.excluded.join(' ')).toContain('Transactions/assets recréés depuis l’historique')

        const parsed = parseBudgetBackupWithImportData(serializeBudgetBackupWithImportData(snapshot))
        expect(parsed.version).toBe(IMPORT_BACKUP_FORMAT_VERSION)
        expect(parsed.data.importBackup.mappingTemplates[0]).toMatchObject({id: 'user-template-1', name: 'My broker template'})
        expect(parsed.data.importBackup.importHistory[0]).toMatchObject({id: 'batch-1', appliedLinks: [expect.objectContaining({operation: 'created'})]})
    })

    it('keeps older backups compatible with an empty import extension', () => {
        const parsed = parseBudgetBackupWithImportData(JSON.stringify(baseGoalsSnapshot()))

        expect(parsed.version).toBe(IMPORT_BACKUP_FORMAT_VERSION)
        expect(parsed.data.importBackup.mappingTemplates).toEqual([])
        expect(parsed.data.importBackup.importHistory).toEqual([])
        expect(parsed.data.importBackup.metadata.auditOnlyRestore).toBe(true)
    })

    it('rejects invalid import backup data with clear errors', () => {
        const broken = createBudgetBackupSnapshotWithImportData(baseGoalsSnapshot(), {
            mappingTemplates: [userTemplate as any],
            importHistory: [importBatch],
        }) as any
        broken.data.importBackup.mappingTemplates[0].id = 'system:bad-template'

        expect(() => parseBudgetBackupWithImportData(JSON.stringify(broken))).toThrow('ne doit pas référencer un template système')
    })

    it('documents what is included and excluded from import backups', () => {
        const snapshot = createBudgetBackupSnapshotWithImportData(baseGoalsSnapshot(), {mappingTemplates: [userTemplate as any], importHistory: [importBatch]})
        const markdown = backupImportDocumentationMarkdown(snapshot.data.importBackup)

        expect(markdown).toContain('## Inclus')
        expect(markdown).toContain('Templates de mapping utilisateur')
        expect(markdown).toContain('## Exclus')
        expect(markdown).toContain('Transactions/assets recréés depuis l’historique')
    })
})
