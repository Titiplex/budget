import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
    CRITICAL_IPC_FORWARDING_CASES,
    EXPECTED_PRELOAD_API_PATHS,
    EXPECTED_PRELOAD_TOP_LEVEL_APIS,
    INVALID_PAYLOAD_FORWARDING_CASES,
    flattenFunctionPaths,
    getByPath,
} from '../fixtures/ipcContractFixtures'

const originalLoad = Module._load

function clearModule(modulePath) {
    try {
        delete require.cache[require.resolve(modulePath)]
    } catch (_error) {
        // The module was not loaded in this test.
    }
}

function clearPreloadCache() {
    clearModule('../../../electron/preload')
}

function installPreloadElectronMock() {
    const exposed = {}
    const ipcRenderer = {
        invoke: vi.fn(async (channel, ...args) => ({ok: true, channel, args})),
        send: vi.fn(),
        on: vi.fn(),
    }
    const contextBridge = {
        exposeInMainWorld: vi.fn((name, api) => {
            exposed[name] = api
        }),
    }

    Module._load = function loadWithPreloadMocks(request) {
        if (request === 'electron') {
            return {contextBridge, ipcRenderer}
        }
        return originalLoad.apply(this, arguments)
    }

    clearPreloadCache()
    require('../../../electron/preload')

    return {contextBridge, exposed, ipcRenderer}
}

function installImportWorkflowHandlerMocks() {
    const importWorkflowErrorAdapter = vi.fn((error) => ({
        code: error.code || 'technicalFailure',
        message: error.exposeMessage ? error.message : 'Erreur technique normalisée.',
        field: error.field || null,
        batchId: error.batchId || null,
        rowNumber: error.rowNumber || null,
        recoverable: error.recoverable ?? false,
        details: error.exposeDetails === true ? error.details || null : null,
    }))

    Module._load = function loadWithImportWorkflowMocks(request) {
        if (request === 'electron') {
            return {
                app: {getPath: () => '/tmp/budget-ipc-contracts'},
                ipcMain: {handle: vi.fn()},
            }
        }
        if (request === '../audit/auditLogService') {
            return {createAuditLogService: () => ({})}
        }
        if (request === '../audit/auditedImportWorkflow') {
            return {createAuditedImportWorkflow: ({base}) => base}
        }
        if (request === '../db') {
            return {getPrisma: () => ({})}
        }
        if (request === '../integrity/integrityCheckService') {
            return {createIntegrityCheckService: () => ({})}
        }
        if (request === '../import/importWorkflowService') {
            return {
                applyImport: vi.fn(),
                applyReconciliationDecisions: vi.fn(),
                cancelImport: vi.fn(),
                createImportBatch: vi.fn(),
                defaultImportWorkflowStore: vi.fn(() => ({})),
                getImportDetail: vi.fn(),
                listDuplicateCandidates: vi.fn(),
                listImportErrors: vi.fn(),
                listImportHistory: vi.fn(),
                parseImportFile: vi.fn(),
                previewImport: vi.fn(),
                toImportWorkflowIpcError: importWorkflowErrorAdapter,
            }
        }
        if (request === '../import/importAuditService') {
            return {
                deleteImportAuditHistory: vi.fn(),
                exportImportAuditReport: vi.fn(),
                getImportAuditDetail: vi.fn(),
                listImportAuditHistory: vi.fn(),
                listImportAuditSources: vi.fn(),
                toImportAuditIpcError: () => null,
            }
        }
        if (request === '../import/importBackupRestoreService') {
            return {
                restoreImportAuditBackup: vi.fn(),
                toImportBackupRestoreIpcError: () => null,
            }
        }
        return originalLoad.apply(this, arguments)
    }

    clearModule('../../../electron/ipc/registerImportWorkflowHandlers')

    return {importWorkflowErrorAdapter}
}

afterEach(() => {
    Module._load = originalLoad
    clearPreloadCache()
    clearModule('../../../electron/ipc/registerImportWorkflowHandlers')
    vi.restoreAllMocks()
})

describe('preload IPC contract', () => {
    it('exposes only the expected renderer APIs and no direct Prisma/database internals', () => {
        const {contextBridge, exposed} = installPreloadElectronMock()

        expect(Object.keys(exposed).sort()).toEqual(EXPECTED_PRELOAD_TOP_LEVEL_APIS)
        expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(EXPECTED_PRELOAD_TOP_LEVEL_APIS.length)
        expect(flattenFunctionPaths(exposed).sort()).toEqual(EXPECTED_PRELOAD_API_PATHS)

        const serializedApi = JSON.stringify(Object.keys(exposed))
        expect(serializedApi).not.toContain('prisma')
        expect(serializedApi).not.toContain('PrismaClient')
        expect(exposed).not.toHaveProperty('reports')
        expect(exposed).not.toHaveProperty('getPrisma')
    })

    it.each(CRITICAL_IPC_FORWARDING_CASES)(
        'forwards $description to the expected IPC channel',
        async ({apiPath, channel, args}) => {
            const {exposed, ipcRenderer} = installPreloadElectronMock()
            const api = getByPath(exposed, apiPath)

            expect(api).toEqual(expect.any(Function))
            await api(...args)

            expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel, ...args)
        },
    )

    it.each(INVALID_PAYLOAD_FORWARDING_CASES)(
        'forwards invalid payloads unchanged so main-process validators own business rules: $apiPath',
        async ({apiPath, channel, args}) => {
            const {exposed, ipcRenderer} = installPreloadElectronMock()
            const api = getByPath(exposed, apiPath)

            await api(...args)

            expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel, ...args)
            expect(ipcRenderer.invoke.mock.calls.at(-1).slice(1)).toEqual(args)
        },
    )

    it('keeps send/on APIs narrow and strips Electron event objects from renderer callbacks', () => {
        const {exposed, ipcRenderer} = installPreloadElectronMock()
        const callback = vi.fn()

        exposed.appShell.setLocale('fr')
        exposed.appShell.sendMenuCommand('open-settings')
        exposed.versions.send('diagnostic:event', {ok: true})
        exposed.versions.on('diagnostic:reply', callback)

        expect(ipcRenderer.send).toHaveBeenCalledWith('app:set-locale', 'fr')
        expect(ipcRenderer.send).toHaveBeenCalledWith('app:menu-command', 'open-settings')
        expect(ipcRenderer.send).toHaveBeenCalledWith('diagnostic:event', {ok: true})
        expect(ipcRenderer.on).toHaveBeenCalledWith('diagnostic:reply', expect.any(Function))

        const wrappedCallback = ipcRenderer.on.mock.calls.at(-1)[1]
        wrappedCallback({internalElectronEvent: true}, 'payload-a', 'payload-b')

        expect(callback).toHaveBeenCalledWith('payload-a', 'payload-b')
    })

    it('passes normalized IPC failure objects through without adding internal details', async () => {
        const normalizedFailure = {
            ok: false,
            data: null,
            error: {
                code: 'invalidImportFile',
                message: 'Le fichier importé est vide ou illisible.',
                field: 'rawText',
                recoverable: true,
                details: null,
            },
        }
        const {exposed, ipcRenderer} = installPreloadElectronMock()
        ipcRenderer.invoke.mockResolvedValueOnce(normalizedFailure)

        const result = await exposed.imports.parseFile({batchId: 'batch_1', rawText: ''})

        expect(result).toEqual(normalizedFailure)
        expect(JSON.stringify(result)).not.toContain('stack')
        expect(JSON.stringify(result)).not.toContain('PrismaClient')
        expect(JSON.stringify(result)).not.toContain('SQLITE')
    })
})

describe('safe IPC handler contract', () => {
    it('returns typed success envelopes from safe handlers', async () => {
        installImportWorkflowHandlerMocks()
        const {registerSafeImportWorkflowHandler} = require('../../../electron/ipc/registerImportWorkflowHandlers')
        const handlers = new Map()
        const ipc = {
            handle: vi.fn((channel, callback) => handlers.set(channel, callback)),
        }

        registerSafeImportWorkflowHandler(ipc, 'contract:success', async (payload) => ({
            id: 'entity-1',
            received: payload,
        }))

        const response = await handlers.get('contract:success')({}, {name: 'Valid payload'})

        expect(response).toEqual({
            ok: true,
            data: {id: 'entity-1', received: {name: 'Valid payload'}},
            error: null,
        })
    })

    it('normalizes technical errors and does not leak stack traces or adapter internals', async () => {
        const {importWorkflowErrorAdapter} = installImportWorkflowHandlerMocks()
        const {registerSafeImportWorkflowHandler} = require('../../../electron/ipc/registerImportWorkflowHandlers')
        const handlers = new Map()
        const ipc = {
            handle: vi.fn((channel, callback) => handlers.set(channel, callback)),
        }
        const technicalError = new Error('SQLITE_CONSTRAINT: raw database detail that must not leak')
        technicalError.code = 'importWriteFailed'
        technicalError.field = 'database'
        technicalError.recoverable = false
        technicalError.details = {
            prismaModel: 'Transaction',
            stack: 'internal stack',
        }

        registerSafeImportWorkflowHandler(ipc, 'contract:error', async () => {
            throw technicalError
        })

        const response = await handlers.get('contract:error')({}, {name: ''})

        expect(importWorkflowErrorAdapter).toHaveBeenCalledWith(technicalError)
        expect(response).toMatchObject({
            ok: false,
            data: null,
            error: {
                code: 'importWriteFailed',
                message: 'Erreur technique normalisée.',
                field: 'database',
                recoverable: false,
                details: null,
            },
        })
        expect(JSON.stringify(response)).not.toContain('SQLITE_CONSTRAINT')
        expect(JSON.stringify(response)).not.toContain('prismaModel')
        expect(JSON.stringify(response)).not.toContain('internal stack')
    })
})
