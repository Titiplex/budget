import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipcMain = {
    handle: vi.fn((channel, callback) => {
        handlers.set(channel, callback)
    }),
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

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerImportWorkflowHandlers',
        '../../../electron/import/importWorkflowService',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installCommonJsMocks() {
    Module._load = function loadWithImportWorkflowIpcMocks(request) {
        if (request === 'electron') {
            return {
                app: {getPath: () => '/tmp/budget-tests'},
                ipcMain,
            }
        }
        return originalLoad.apply(this, arguments)
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipcMain.handle.mockClear()
    clearCommonJsCache()
})

function csvFixture() {
    return [
        'Date,Description,Amount,Currency,Account',
        '2026-05-01,Coffee,-4.50,CAD,Main',
        'bad-date,Broken,abc,CAD,Main',
    ].join('\n')
}

describe('import workflow IPC handlers', () => {
    it('registers workflow channels and runs create, parse, preview, apply and history', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {createMemoryImportWorkflowStore} = require('../../../electron/import/importWorkflowService')
        const {registerImportWorkflowHandlers} = require('../../../electron/ipc/registerImportWorkflowHandlers')
        const store = createMemoryImportWorkflowStore()

        registerImportWorkflowHandlers({ipc: ipcMain, store})

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            'import:batch:create',
            'import:file:parse',
            'import:preview:create',
            'import:apply',
            'import:cancel',
            'import:history:list',
            'import:detail:get',
            'import:errors:list',
            'import:duplicates:list',
            'import:reconciliation:apply',
        ]))

        const created = await handlers.get('import:batch:create')({}, {
            importType: 'transactions',
            defaultCurrency: 'CAD',
            fileMetadata: {fileName: 'transactions.csv', provider: 'test-bank'},
            template: bankCsvTemplate,
        })
        expect(created).toMatchObject({ok: true, data: {status: 'draft', fileName: 'transactions.csv'}, error: null})

        const parsed = await handlers.get('import:file:parse')({}, {
            batchId: created.data.id,
            rawText: csvFixture(),
            defaultCurrency: 'CAD',
        })
        expect(parsed.ok).toBe(true)
        expect(parsed.data.batch.rowCount).toBe(2)
        expect(parsed.data.parsed.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({code: 'invalidDate'}),
            expect.objectContaining({code: 'invalidAmount'}),
        ]))

        const preview = await handlers.get('import:preview:create')({}, {
            batchId: created.data.id,
            targetAccountId: 1,
            defaultCurrency: 'CAD',
        })
        expect(preview.ok).toBe(true)
        expect(preview.data.stats).toMatchObject({
            totalRows: 2,
            createTransactionRows: 1,
            skippedRows: 1,
        })

        const applied = await handlers.get('import:apply')({}, {batchId: created.data.id})
        expect(applied.ok).toBe(true)
        expect(applied.data.batch.status).toBe('applied')
        expect(applied.data.appliedLinks.map((link) => link.operation)).toEqual(['created', 'skipped'])

        const history = await handlers.get('import:history:list')({}, {})
        expect(history.ok).toBe(true)
        expect(history.data).toEqual([expect.objectContaining({id: created.data.id, status: 'applied', rowCount: 2})])

        const detail = await handlers.get('import:detail:get')({}, created.data.id)
        expect(detail.ok).toBe(true)
        expect(detail.data.appliedLinks).toHaveLength(2)
    })

    it('lists errors and duplicate candidates through IPC', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {createMemoryImportWorkflowStore} = require('../../../electron/import/importWorkflowService')
        const {registerImportWorkflowHandlers} = require('../../../electron/ipc/registerImportWorkflowHandlers')
        const store = createMemoryImportWorkflowStore({
            existingRows: [{
                id: 'existing-1',
                entityId: 123,
                targetKind: 'transaction',
                transactionDate: '2026-05-01T00:00:00.000Z',
                label: 'Coffee',
                amount: -4.5,
                currency: 'CAD',
                normalizedData: {date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD'},
            }],
        })

        registerImportWorkflowHandlers({ipc: ipcMain, store})
        const created = await handlers.get('import:batch:create')({}, {defaultCurrency: 'CAD', template: bankCsvTemplate})
        await handlers.get('import:file:parse')({}, {batchId: created.data.id, rawText: csvFixture(), defaultCurrency: 'CAD'})
        await handlers.get('import:preview:create')({}, {batchId: created.data.id, targetAccountId: 1})

        const errors = await handlers.get('import:errors:list')({}, created.data.id)
        const duplicates = await handlers.get('import:duplicates:list')({}, created.data.id)

        expect(errors.ok).toBe(true)
        expect(errors.data).toEqual(expect.arrayContaining([
            expect.objectContaining({code: 'invalidDate'}),
            expect.objectContaining({code: 'invalidAmount'}),
        ]))
        expect(duplicates.ok).toBe(true)
        expect(duplicates.data[0]).toMatchObject({entityId: 123, confidence: 0.99})
    })

    it('returns exploitable IPC errors for invalid files and expired previews', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {createMemoryImportWorkflowStore} = require('../../../electron/import/importWorkflowService')
        const {registerImportWorkflowHandlers} = require('../../../electron/ipc/registerImportWorkflowHandlers')
        const store = createMemoryImportWorkflowStore()

        registerImportWorkflowHandlers({ipc: ipcMain, store})

        const created = await handlers.get('import:batch:create')({}, {defaultCurrency: 'CAD'})
        const invalidParse = await handlers.get('import:file:parse')({}, {batchId: created.data.id, rawText: ''})
        const invalidApply = await handlers.get('import:apply')({}, {batchId: created.data.id})

        expect(invalidParse).toMatchObject({
            ok: false,
            data: null,
            error: {code: 'invalidImportFile', field: 'rawText', recoverable: true},
        })
        expect(invalidApply).toMatchObject({
            ok: false,
            data: null,
            error: {code: 'previewExpired', recoverable: true},
        })
    })

    it('applies explicit reconciliation decisions through IPC', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {createMemoryImportWorkflowStore} = require('../../../electron/import/importWorkflowService')
        const {registerImportWorkflowHandlers} = require('../../../electron/ipc/registerImportWorkflowHandlers')
        const store = createMemoryImportWorkflowStore()

        registerImportWorkflowHandlers({ipc: ipcMain, store})
        const created = await handlers.get('import:batch:create')({}, {defaultCurrency: 'CAD', template: bankCsvTemplate})
        await handlers.get('import:file:parse')({}, {batchId: created.data.id, rawText: 'Date,Description,Amount,Currency\n2026-05-01,Coffee,-4.50,CAD', defaultCurrency: 'CAD'})
        const preview = await handlers.get('import:preview:create')({}, {batchId: created.data.id, targetAccountId: 1})
        expect(preview.ok).toBe(true)
        const decision = {
            id: 'decision-user-1',
            batchId: created.data.id,
            normalizedRowId: preview.data.rows[0].rowId,
            rowNumber: preview.data.rows[0].rowNumber,
            kind: 'linkToExisting',
            status: 'pending',
            targetEntityType: 'transaction',
            targetEntityId: 456,
            payload: {previewAction: preview.data.rows[0].action},
            reason: 'User linked imported row to an existing transaction.',
            reasonSource: 'user',
            decidedBy: 'tester',
            decidedAt: null,
            createdAt: '2026-05-03T00:00:00.000Z',
            updatedAt: '2026-05-03T00:00:00.000Z',
            history: [],
        }

        const applied = await handlers.get('import:reconciliation:apply')({}, {batchId: created.data.id, decisions: [decision]})

        expect(applied.ok).toBe(true)
        expect(applied.data.appliedLinks[0]).toMatchObject({operation: 'linked', transactionId: 456})
        expect(applied.data.batch.decisions[0]).toMatchObject({kind: 'linkToExisting', status: 'applied'})
    })
})
