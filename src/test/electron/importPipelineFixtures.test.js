import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'

const {
    applyImport,
    createImportBatch,
    createMemoryImportWorkflowStore,
    getImportDetail,
    parseImportFile,
    previewImport,
} = require('../../../electron/import/importWorkflowService')
const {
    getImportAuditDetail,
    listImportAuditHistory,
} = require('../../../electron/import/importAuditService')

function fixture(name) {
    return readFileSync(join(process.cwd(), 'src/test/fixtures/import-presets', name), 'utf8')
}

const bankCsvTemplate = {
    importType: 'transactions',
    defaultCurrency: 'CAD',
    columnMappings: [
        {sourceColumn: 'Date', targetField: 'date'},
        {sourceColumn: 'Description', targetField: 'label'},
        {sourceColumn: 'Amount', targetField: 'amount'},
        {sourceColumn: 'Currency', targetField: 'currency'},
        {sourceColumn: 'Account', targetField: 'accountName'},
    ],
}

describe('import pipeline fixtures', () => {
    it('runs a local dry-run and apply flow using a normal bank CSV fixture', async () => {
        const store = createMemoryImportWorkflowStore()
        const batch = await createImportBatch(store, {
            importType: 'transactions',
            defaultCurrency: 'CAD',
            fileMetadata: {fileName: 'bank-transactions.csv', provider: 'demo-bank'},
            template: bankCsvTemplate,
        })

        const parsed = await parseImportFile(store, {
            batchId: batch.id,
            rawText: ['Date,Description,Amount,Currency,Account', '2026-05-01,Coffee,-4.50,CAD,Main', '2026-05-02,Salary,2500.00,CAD,Main'].join('\n'),
            defaultCurrency: 'CAD',
        })
        const preview = await previewImport(store, {batchId: batch.id, targetAccountId: 1, defaultCurrency: 'CAD'})
        const applied = await applyImport(store, {batchId: batch.id})
        const audit = await getImportAuditDetail(store, batch.id)

        expect(parsed.parsed.normalizedRows).toHaveLength(2)
        expect(preview).toMatchObject({dryRun: true, canApply: true, stats: {createTransactionRows: 2, skippedRows: 0}})
        expect(applied.batch.status).toBe('applied')
        expect(applied.appliedLinks).toHaveLength(2)
        expect(audit).toMatchObject({id: batch.id, appliedRowCount: 2, errorCount: 0, decisionCount: 2})
    })

    it('keeps broken CSV rows out of application but preserves clear errors in history', async () => {
        const store = createMemoryImportWorkflowStore()
        const batch = await createImportBatch(store, {
            importType: 'transactions',
            defaultCurrency: 'CAD',
            fileMetadata: {fileName: 'broken-import.csv', provider: 'demo-bank'},
            template: bankCsvTemplate,
        })

        const parsed = await parseImportFile(store, {batchId: batch.id, rawText: fixture('broken-import.csv'), defaultCurrency: 'CAD'})
        const preview = await previewImport(store, {batchId: batch.id, targetAccountId: 1, defaultCurrency: 'CAD'})
        const applied = await applyImport(store, {batchId: batch.id})
        const detail = await getImportDetail(store, batch.id)

        expect(parsed.parsed.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({code: 'invalidDate'}),
            expect.objectContaining({code: 'invalidAmount'}),
            expect.objectContaining({code: 'invalidCurrency'}),
        ]))
        expect(preview.stats).toMatchObject({totalRows: 5, createTransactionRows: 1, skippedRows: 4})
        expect(applied.appliedLinks.map((link) => link.operation)).toEqual(['created', 'skipped', 'skipped', 'skipped', 'skipped'])
        expect(detail.errors).toHaveLength(4)
    })

    it('detects repeated rows in the same CSV before apply', async () => {
        const store = createMemoryImportWorkflowStore()
        const batch = await createImportBatch(store, {
            importType: 'transactions',
            defaultCurrency: 'CAD',
            fileMetadata: {fileName: 'duplicate-transactions.csv', provider: 'demo-bank'},
            template: bankCsvTemplate,
        })

        await parseImportFile(store, {batchId: batch.id, rawText: fixture('duplicate-transactions.csv'), defaultCurrency: 'CAD'})
        const preview = await previewImport(store, {batchId: batch.id, targetAccountId: 1, defaultCurrency: 'CAD'})
        const history = await listImportAuditHistory(store)

        expect(preview.stats.duplicateCount).toBe(2)
        expect(preview.rows.filter((row) => row.duplicateCandidates.length > 0)).toHaveLength(2)
        expect(history[0]).toMatchObject({id: batch.id, duplicateCount: 2})
    })

    it('imports investment-oriented fixtures without any external service', async () => {
        const store = createMemoryImportWorkflowStore()
        const batch = await createImportBatch(store, {
            importType: 'investments',
            defaultCurrency: 'CAD',
            fileMetadata: {fileName: 'broker-transactions.csv', provider: 'demo-broker'},
            template: {
                importType: 'investments',
                defaultCurrency: 'CAD',
                columnMappings: [
                    {sourceColumn: 'Trade Date', targetField: 'date'},
                    {sourceColumn: 'Action', targetField: 'operationType'},
                    {sourceColumn: 'Symbol', targetField: 'symbol'},
                    {sourceColumn: 'Quantity', targetField: 'quantity'},
                    {sourceColumn: 'Price', targetField: 'unitPrice'},
                    {sourceColumn: 'Cash Amount', targetField: 'amount'},
                    {sourceColumn: 'Currency', targetField: 'currency'},
                    {sourceColumn: 'Account', targetField: 'accountName'},
                ],
            },
        })

        await parseImportFile(store, {batchId: batch.id, rawText: fixture('broker-transactions.csv'), defaultCurrency: 'CAD'})
        const preview = await previewImport(store, {batchId: batch.id, targetPortfolioId: 1, defaultCurrency: 'CAD'})

        expect(preview.stats).toMatchObject({totalRows: 2, createAssetOperationRows: 2, skippedRows: 0})
        expect(preview.rows[0]).toMatchObject({targetEntityType: 'investmentMovement', action: 'createAssetOperation'})
    })
})
