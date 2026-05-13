import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createRequire} from 'node:module'

import {
    existingGroceriesImportRow,
    expectedSimpleTransactionRows,
    importCsvFixtures,
    importTemplates,
} from '../fixtures/importPipelineFixtures.js'

const require = createRequire(import.meta.url)

const {
    applyImport,
    createImportBatch,
    createMemoryImportWorkflowStore,
    getImportDetail,
    listDuplicateCandidates,
    listImportErrors,
    listImportHistory,
    parseImportFile,
    previewImport,
    toImportWorkflowIpcError,
} = require('../../../electron/import/importWorkflowService')

const FIXED_NOW = new Date('2026-05-20T12:00:00.000Z')

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
    vi.useRealTimers()
})

async function createBatchAndParse({
    rawText = importCsvFixtures.simpleTransactions,
    template = importTemplates.bankTransactions,
    defaultCurrency = template.defaultCurrency || 'CAD',
    fileName = 'fixture.csv',
    fileHash = null,
    store = createMemoryImportWorkflowStore(),
    parseOptions = {},
} = {}) {
    const batch = await createImportBatch(store, {
        importType: template.importType || 'transactions',
        defaultCurrency,
        fileMetadata: {
            fileName,
            fileHash,
            provider: 'fixture-provider',
        },
        template,
    })

    const parsed = await parseImportFile(store, {
        batchId: batch.id,
        rawText,
        defaultCurrency,
        mappingTemplate: template,
        ...parseOptions,
    })

    return {batch: parsed.batch, parsed: parsed.parsed, store}
}

function expectNormalizedRows(rows, expectedRows) {
    expect(rows).toHaveLength(expectedRows.length)

    expectedRows.forEach((expectedRow, index) => {
        expect(rows[index]).toMatchObject({
            status: 'valid',
            targetKind: 'transaction',
            transactionDate: expectedRow.date,
            label: expectedRow.label,
            amount: expectedRow.amount,
            currency: expectedRow.currency,
            accountName: expectedRow.accountName,
        })
        expect(rows[index].normalizedData).toMatchObject(expectedRow)
    })
}

describe('import pipeline regression fixtures', () => {
    it('parses simple transaction CSV rows with stable dates, amounts, currencies and template mappings', async () => {
        const {parsed} = await createBatchAndParse({
            rawText: importCsvFixtures.simpleTransactions,
            template: importTemplates.bankTransactions,
            fileName: 'transactions-simple.csv',
        })

        expect(parsed.delimiter).toBe(',')
        expect(parsed.headers).toEqual(['Date', 'Description', 'Amount', 'Currency', 'Account'])
        expect(parsed.errors).toEqual([])
        expectNormalizedRows(parsed.normalizedRows, expectedSimpleTransactionRows)
    })

    it('detects semicolon separators and comma decimals for multi-currency transactions', async () => {
        const {parsed} = await createBatchAndParse({
            rawText: importCsvFixtures.multiCurrencyTransactions,
            template: importTemplates.semicolonBankTransactions,
            defaultCurrency: 'CAD',
            fileName: 'transactions-multicurrency.csv',
            parseOptions: {
                decimalSeparator: ',',
            },
        })

        expect(parsed.delimiter).toBe(';')
        expect(parsed.errors).toEqual([])
        expect(parsed.normalizedRows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                transactionDate: '2026-05-03T00:00:00.000Z',
                label: 'Lunch Paris',
                amount: -18.75,
                currency: 'EUR',
                accountName: 'Euro Cash',
            }),
            expect.objectContaining({
                transactionDate: '2026-05-04T00:00:00.000Z',
                label: 'USD Dividend',
                amount: 12.34,
                currency: 'USD',
                accountName: 'Brokerage USD',
            }),
        ]))
    })

    it.each([
        [
            'broker transactions',
            importCsvFixtures.brokerTransactions,
            importTemplates.brokerOperations,
            {
                operationType: 'BUY',
                symbol: 'XEQT',
                quantity: 10,
                unitPrice: 30.5,
                fees: 1,
                currency: 'CAD',
            },
        ],
        [
            'holdings',
            importCsvFixtures.holdings,
            importTemplates.holdings,
            {
                symbol: 'CASH',
                quantity: 1500,
                unitPrice: 1,
                currency: 'CAD',
            },
        ],
        [
            'dividends and interests',
            importCsvFixtures.dividendsInterests,
            importTemplates.incomeOperations,
            {
                operationType: 'DIVIDEND',
                symbol: 'XEQT',
                amount: 2.4,
                currency: 'CAD',
            },
        ],
        [
            'crypto trades',
            importCsvFixtures.cryptoTrades,
            importTemplates.cryptoTrades,
            {
                operationType: 'BUY',
                symbol: 'BTC',
                quantity: 0.01,
                unitPrice: 90000,
                fees: 4,
                currency: 'CAD',
            },
        ],
    ])('parses MVP investment fixture: %s', async (_label, rawText, template, expectedData) => {
        const {parsed} = await createBatchAndParse({
            rawText,
            template,
            fileName: `${_label}.csv`,
        })

        expect(parsed.errors).toEqual([])
        expect(parsed.normalizedRows[0]).toMatchObject({
            status: 'valid',
            targetKind: 'investmentMovement',
        })
        expect(parsed.normalizedRows[0].normalizedData).toMatchObject(expectedData)
    })

    it('keeps preview dry-run side-effect free for applied links and dedupe state', async () => {
        const {batch, store} = await createBatchAndParse({
            rawText: importCsvFixtures.simpleTransactions,
            template: importTemplates.bankTransactions,
            fileName: 'transactions-simple.csv',
        })
        const beforePreview = await store.load()

        expect(beforePreview.appliedLinks).toEqual([])
        expect(beforePreview.existingRows).toEqual([])
        expect(beforePreview.batches[0].appliedLinks).toEqual([])

        const preview = await previewImport(store, {
            batchId: batch.id,
            targetAccountId: 42,
            defaultCurrency: 'CAD',
        })
        const afterPreview = await store.load()

        expect(preview.dryRun).toBe(true)
        expect(preview.canApply).toBe(true)
        expect(preview.stats).toMatchObject({
            totalRows: 2,
            createTransactionRows: 2,
            updateTransactionRows: 0,
            skippedRows: 0,
            duplicateCount: 0,
        })

        expect(afterPreview.appliedLinks).toEqual([])
        expect(afterPreview.existingRows).toEqual([])
        expect(afterPreview.batches[0].appliedLinks).toEqual([])
        expect(afterPreview.batches[0].preview.rows).toHaveLength(2)
    })

    it('reports line-by-line validation errors for invalid dates, amounts and currencies', async () => {
        const {batch, parsed, store} = await createBatchAndParse({
            rawText: importCsvFixtures.withErrors,
            template: importTemplates.bankTransactions,
            fileName: 'with-errors.csv',
        })

        expect(parsed.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({rowNumber: 2, code: 'invalidDate', field: 'date'}),
            expect.objectContaining({rowNumber: 3, code: 'invalidAmount', field: 'amount'}),
            expect.objectContaining({rowNumber: 4, code: 'invalidCurrency', field: 'currency'}),
        ]))

        const errors = await listImportErrors(store, batch.id)
        expect(errors.map((error) => error.code)).toEqual(['invalidDate', 'invalidAmount', 'invalidCurrency'])

        const preview = await previewImport(store, {
            batchId: batch.id,
            targetAccountId: 42,
        })

        expect(preview.stats).toMatchObject({
            totalRows: 3,
            skippedRows: 3,
            errorCount: 3,
            createTransactionRows: 0,
        })
        expect(preview.rows.every((row) => row.action === 'skip')).toBe(true)
    })

    it('marks missing mandatory columns as row errors instead of creating partial data silently', async () => {
        const {batch, parsed, store} = await createBatchAndParse({
            rawText: importCsvFixtures.missingColumns,
            template: importTemplates.missingColumns,
            fileName: 'missing-columns.csv',
        })

        expect(parsed.normalizedRows).toHaveLength(1)
        expect(parsed.errors).toEqual([
            expect.objectContaining({
                rowNumber: 2,
                code: 'invalidDate',
                field: 'date',
            }),
        ])

        const preview = await previewImport(store, {
            batchId: batch.id,
            targetAccountId: 42,
        })

        expect(preview.rows[0]).toMatchObject({
            action: 'skip',
            reviewRequired: false,
        })
        expect(preview.rows[0].missingFields).toContain('date')
    })

    it('detects exact duplicates against existing data and within the same CSV batch', async () => {
        const store = createMemoryImportWorkflowStore({
            existingRows: [existingGroceriesImportRow],
        })
        const {batch} = await createBatchAndParse({
            rawText: importCsvFixtures.duplicates,
            template: importTemplates.bankTransactions,
            fileName: 'duplicates.csv',
            store,
        })

        const preview = await previewImport(store, {
            batchId: batch.id,
            targetAccountId: 42,
        })
        const duplicateCandidates = await listDuplicateCandidates(store, batch.id)

        expect(preview.stats.duplicateCount).toBe(2)
        expect(preview.stats.updateTransactionRows).toBe(2)
        expect(preview.rows.map((row) => row.action)).toEqual(['updateTransaction', 'updateTransaction'])
        expect(duplicateCandidates.length).toBeGreaterThanOrEqual(2)
        expect(duplicateCandidates).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entityId: 123,
                confidence: 0.99,
                strategy: 'strict',
            }),
            expect.objectContaining({
                confidence: 1,
                reason: 'Doublon exact dans le même batch.',
            }),
        ]))
    })

    it('prevents an exact reimport from creating obvious duplicate transactions', async () => {
        const store = createMemoryImportWorkflowStore()
        const fileHash = 'fixture-simple-transactions-v1'
        const first = await createBatchAndParse({
            rawText: importCsvFixtures.simpleTransactions,
            template: importTemplates.bankTransactions,
            fileName: 'transactions-simple.csv',
            fileHash,
            store,
        })

        await previewImport(store, {
            batchId: first.batch.id,
            targetAccountId: 42,
        })
        const firstApply = await applyImport(store, {
            batchId: first.batch.id,
        })

        expect(firstApply.appliedLinks.map((link) => link.operation)).toEqual(['created', 'created'])

        const second = await createBatchAndParse({
            rawText: importCsvFixtures.simpleTransactions,
            template: importTemplates.bankTransactions,
            fileName: 'transactions-simple.csv',
            fileHash,
            store,
        })
        const secondPreview = await previewImport(store, {
            batchId: second.batch.id,
            targetAccountId: 42,
        })
        const secondApply = await applyImport(store, {
            batchId: second.batch.id,
        })

        expect(secondPreview.stats).toMatchObject({
            createTransactionRows: 0,
            updateTransactionRows: 2,
            duplicateCount: 2,
        })
        expect(secondPreview.duplicateCandidates.every((candidate) => candidate.confidence === 1)).toBe(true)
        expect(secondApply.appliedLinks.map((link) => link.operation)).toEqual(['updated', 'updated'])

        const state = await store.load()
        expect(state.existingRows).toHaveLength(2)
    })

    it('applies explicit reconciliation decisions without creating new rows for linked entities', async () => {
        const store = createMemoryImportWorkflowStore()
        const {batch} = await createBatchAndParse({
            rawText: importCsvFixtures.simpleTransactions,
            template: importTemplates.bankTransactions,
            fileName: 'transactions-simple.csv',
            store,
        })
        const preview = await previewImport(store, {
            batchId: batch.id,
            targetAccountId: 42,
        })
        const decision = {
            id: 'decision-link-salary',
            batchId: batch.id,
            normalizedRowId: preview.rows[0].rowId,
            rowNumber: preview.rows[0].rowNumber,
            kind: 'linkToExisting',
            status: 'pending',
            targetEntityType: 'transaction',
            targetEntityId: 777,
            payload: {previewAction: preview.rows[0].action},
            reason: 'Fixture links salary row to an existing transaction.',
            reasonSource: 'user',
            decidedBy: 'regression-test',
            decidedAt: null,
            createdAt: '2026-05-20T12:00:00.000Z',
            updatedAt: '2026-05-20T12:00:00.000Z',
            history: [],
        }

        const applied = await applyImport(store, {
            batchId: batch.id,
            decisions: [decision],
        })

        expect(applied.appliedLinks).toEqual([
            expect.objectContaining({
                operation: 'linked',
                transactionId: 777,
            }),
        ])
        expect(applied.decisions[0]).toMatchObject({
            id: 'decision-link-salary',
            kind: 'linkToExisting',
            status: 'applied',
        })

        const state = await store.load()
        expect(state.existingRows).toEqual([])
    })

    it('returns clean IPC-friendly errors for invalid files and expired previews', async () => {
        const store = createMemoryImportWorkflowStore()
        const batch = await createImportBatch(store, {
            defaultCurrency: 'CAD',
            template: importTemplates.bankTransactions,
        })

        await expect(parseImportFile(store, {
            batchId: batch.id,
            rawText: '',
        })).rejects.toMatchObject({
            code: 'invalidImportFile',
            field: 'rawText',
            recoverable: true,
        })

        try {
            await applyImport(store, {
                batchId: batch.id,
            })
        } catch (error) {
            expect(toImportWorkflowIpcError(error)).toMatchObject({
                code: 'previewExpired',
                field: null,
                recoverable: true,
            })
        }
    })

    it('persists final application history and detail separately from dry-run preview state', async () => {
        const store = createMemoryImportWorkflowStore()
        const {batch} = await createBatchAndParse({
            rawText: importCsvFixtures.simpleTransactions,
            template: importTemplates.bankTransactions,
            fileName: 'transactions-simple.csv',
            store,
        })

        await previewImport(store, {
            batchId: batch.id,
            targetAccountId: 42,
        })
        await applyImport(store, {
            batchId: batch.id,
        })

        const history = await listImportHistory(store)
        const detail = await getImportDetail(store, batch.id)

        expect(history).toEqual([
            expect.objectContaining({
                id: batch.id,
                status: 'applied',
                rowCount: 2,
                errorCount: 0,
                duplicateCount: 0,
                fileName: 'transactions-simple.csv',
            }),
        ])
        expect(detail).toMatchObject({
            id: batch.id,
            status: 'applied',
            rowCount: 2,
        })
        expect(detail.preview.dryRun).toBe(true)
        expect(detail.appliedLinks.map((link) => link.operation)).toEqual(['created', 'created'])
    })
})
