import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipc = {
    handle: vi.fn((channel, callback) => handlers.set(channel, callback)),
}

function clearCommonJsCache() {
    try {
        delete require.cache[require.resolve('../../../electron/ipc/registerSecretHandlers')]
    } catch (_error) {
        // ignore
    }
}

function installElectronMock() {
    Module._load = function loadWithMocks(request) {
        if (request === 'electron') {
            return {app: {}, ipcMain: ipc, safeStorage: {}}
        }
        return originalLoad.apply(this, arguments)
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipc.handle.mockClear()
    clearCommonJsCache()
})

describe('secret handlers audit logging', () => {
    it('logs secret save/delete/clear through AuditLogService without exposing values', async () => {
        installElectronMock()
        const {SECRET_IPC_CHANNELS, registerSecretHandlers} = require('../../../electron/ipc/registerSecretHandlers')
        const store = {
            getStorageInfo: vi.fn(),
            saveSecret: vi.fn(async () => ({key: 'provider:api', saved: true})),
            hasSecret: vi.fn(),
            listSecretMetadata: vi.fn(),
            deleteSecret: vi.fn(async () => ({key: 'provider:api', deleted: true})),
            clearSecrets: vi.fn(async () => ({deletedCount: 2})),
        }
        const auditLog = {
            logSecretChange: vi.fn(async () => null),
        }

        registerSecretHandlers({ipc, store, auditLog})

        const saved = await handlers.get(SECRET_IPC_CHANNELS.SAVE)({}, {
            key: 'provider:api',
            service: 'market-data',
            provider: 'demo',
            value: 'should-never-be-sent-to-audit',
        })
        const deleted = await handlers.get(SECRET_IPC_CHANNELS.DELETE)({}, {
            key: 'provider:api',
            service: 'market-data',
            provider: 'demo',
        })
        const cleared = await handlers.get(SECRET_IPC_CHANNELS.CLEAR)({}, {
            service: 'market-data',
            provider: 'demo',
        })

        expect(saved.ok).toBe(true)
        expect(deleted.ok).toBe(true)
        expect(cleared.ok).toBe(true)
        expect(auditLog.logSecretChange).toHaveBeenCalledTimes(3)
        expect(auditLog.logSecretChange).toHaveBeenNthCalledWith(1, {
            action: 'create',
            key: 'provider:api',
            service: 'market-data',
            provider: 'demo',
            source: 'secret:save',
        })
        expect(auditLog.logSecretChange).toHaveBeenNthCalledWith(2, {
            action: 'delete',
            key: 'provider:api',
            service: 'market-data',
            provider: 'demo',
            source: 'secret:delete',
        })
        expect(auditLog.logSecretChange).toHaveBeenNthCalledWith(3, {
            action: 'clear',
            service: 'market-data',
            provider: 'demo',
            clearedCount: 2,
            source: 'secret:clear',
        })
        expect(JSON.stringify(auditLog.logSecretChange.mock.calls)).not.toContain('should-never-be-sent-to-audit')
    })
})
