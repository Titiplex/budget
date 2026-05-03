import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipcMain = {
    handle: vi.fn((channel, callback) => {
        handlers.set(channel, callback)
    }),
}

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerImportMappingTemplateHandlers',
        '../../../electron/import/mappingTemplateService',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installCommonJsMocks() {
    Module._load = function loadWithImportMappingTemplateIpcMocks(request) {
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

function validTemplate() {
    return {
        name: 'IPC CSV template',
        sourceType: 'csvFile',
        importType: 'transactions',
        defaultCurrency: 'CAD',
        dateFormat: 'yyyy-MM-dd',
        decimalSeparator: '.',
        deduplicationStrategy: 'strict',
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Description', targetField: 'label', fieldType: 'string'},
            {sourceColumn: 'Amount', targetField: 'amount', fieldType: 'number', required: true},
        ],
    }
}

describe('import mapping template IPC handlers', () => {
    it('registers template channels and returns safe success envelopes', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {createMemoryMappingTemplateStore} = require('../../../electron/import/mappingTemplateService')
        const {registerImportMappingTemplateHandlers} = require('../../../electron/ipc/registerImportMappingTemplateHandlers')
        const store = createMemoryMappingTemplateStore()

        registerImportMappingTemplateHandlers({ipc: ipcMain, store})

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            'import:mappingTemplate:list',
            'import:mappingTemplate:get',
            'import:mappingTemplate:create',
            'import:mappingTemplate:update',
            'import:mappingTemplate:delete',
            'import:mappingTemplate:duplicate',
            'import:mappingTemplate:validate',
            'import:mappingTemplate:saveFromImport',
        ]))

        const created = await handlers.get('import:mappingTemplate:create')({}, validTemplate())
        const listed = await handlers.get('import:mappingTemplate:list')({}, {userOnly: true})

        expect(created).toMatchObject({ok: true, data: {name: 'IPC CSV template'}, error: null})
        expect(listed.ok).toBe(true)
        expect(listed.data).toHaveLength(1)
    })

    it('returns validation errors instead of throwing raw exceptions', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {createMemoryMappingTemplateStore} = require('../../../electron/import/mappingTemplateService')
        const {registerImportMappingTemplateHandlers} = require('../../../electron/ipc/registerImportMappingTemplateHandlers')
        const store = createMemoryMappingTemplateStore()

        registerImportMappingTemplateHandlers({ipc: ipcMain, store})

        const result = await handlers.get('import:mappingTemplate:create')({}, {
            ...validTemplate(),
            columnMappings: [
                {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
            ],
        })

        expect(result.ok).toBe(false)
        expect(result.data).toBeNull()
        expect(result.error).toMatchObject({code: 'incompleteMapping', field: 'columnMappings'})
    })
})
