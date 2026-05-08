import Module from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
        '../../../electron/security/secretStore',
        '../../../electron/ipc/registerSecretHandlers',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installElectronMock() {
    Module._load = function loadWithSecretIpcMocks(request) {
        if (request === 'electron') {
            return {
                app: {getPath: () => '/tmp/budget-secret-tests'},
                ipcMain,
                safeStorage: {
                    isEncryptionAvailable: () => false,
                },
            }
        }
        return originalLoad.apply(this, arguments)
    }
}

function tempDirectory() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'budget-secret-store-'))
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipcMain.handle.mockClear()
    clearCommonJsCache()
})

describe('SecretStore abstraction', () => {
    it('saves, reads and deletes secrets through the memory mock without leaking values in metadata', async () => {
        clearCommonJsCache()
        const {
            SECRET_SECURITY_LEVELS,
            createMemorySecretStore,
        } = require('../../../electron/security/secretStore')
        const store = createMemorySecretStore({now: () => new Date('2026-05-08T12:00:00.000Z')})

        const metadata = await store.saveSecret({
            namespace: 'market-data',
            id: 'provider-token',
            label: 'Provider token',
            value: 'super-secret-token',
        })

        expect(metadata).toMatchObject({
            id: 'market-data:provider-token',
            namespace: 'market-data',
            securityLevel: SECRET_SECURITY_LEVELS.MEMORY_ONLY,
        })
        expect(JSON.stringify(metadata)).not.toContain('super-secret-token')
        await expect(store.hasSecret({namespace: 'market-data', id: 'provider-token'})).resolves.toBe(true)
        await expect(store.readSecret({namespace: 'market-data', id: 'provider-token'}))
            .resolves.toMatchObject({value: 'super-secret-token'})

        const listed = await store.listSecretMetadata({namespace: 'market-data'})
        expect(listed).toHaveLength(1)
        expect(JSON.stringify(listed)).not.toContain('super-secret-token')

        await expect(store.deleteSecret({namespace: 'market-data', id: 'provider-token'}))
            .resolves.toMatchObject({deleted: true})
        await expect(store.hasSecret({namespace: 'market-data', id: 'provider-token'})).resolves.toBe(false)
    })

    it('uses a clearly marked encrypted local fallback when no OS vault is provided', async () => {
        clearCommonJsCache()
        const {
            SECRET_SECURITY_LEVELS,
            SECRET_STORE_BACKENDS,
            createFileSecretStore,
        } = require('../../../electron/security/secretStore')
        const directory = tempDirectory()
        const store = createFileSecretStore({directory, safeStorage: null})

        const info = store.getStorageInfo()
        expect(info).toMatchObject({
            storageBackend: SECRET_STORE_BACKENDS.LOCAL_FALLBACK,
            securityLevel: SECRET_SECURITY_LEVELS.LOCAL_FALLBACK,
            lessSecureFallback: true,
        })
        expect(info.warning).toContain('moins sûr')

        await store.saveSecret({namespace: 'sync', id: 'api-key', value: 'plain-value-never-in-json'})

        const rawVault = fs.readFileSync(path.join(directory, 'secret-store.json'), 'utf8')
        expect(rawVault).not.toContain('plain-value-never-in-json')
        expect(rawVault).toContain('aes-256-gcm-local-fallback')
        await expect(store.readSecret({namespace: 'sync', id: 'api-key'}))
            .resolves.toMatchObject({value: 'plain-value-never-in-json'})
    })

    it('returns business errors for missing and corrupted secrets', async () => {
        clearCommonJsCache()
        const {
            SECRET_ERROR_CODES,
            createFileSecretStore,
        } = require('../../../electron/security/secretStore')
        const directory = tempDirectory()
        const store = createFileSecretStore({directory})

        await expect(store.readSecret({namespace: 'missing', id: 'token'}))
            .rejects.toMatchObject({code: SECRET_ERROR_CODES.SECRET_UNAVAILABLE})

        fs.writeFileSync(path.join(directory, 'secret-store.json'), '{broken json', 'utf8')
        await expect(store.listSecretMetadata())
            .rejects.toMatchObject({code: SECRET_ERROR_CODES.SECRET_CORRUPTED})
    })

    it('registers renderer-safe IPC channels without exposing raw readSecret', async () => {
        clearCommonJsCache()
        installElectronMock()
        const {createMemorySecretStore} = require('../../../electron/security/secretStore')
        const {SECRET_IPC_CHANNELS, registerSecretHandlers} = require('../../../electron/ipc/registerSecretHandlers')
        const store = createMemorySecretStore({now: () => new Date('2026-05-08T12:00:00.000Z')})

        registerSecretHandlers({ipc: ipcMain, store})

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            SECRET_IPC_CHANNELS.GET_STORAGE_INFO,
            SECRET_IPC_CHANNELS.SAVE,
            SECRET_IPC_CHANNELS.HAS,
            SECRET_IPC_CHANNELS.LIST_METADATA,
            SECRET_IPC_CHANNELS.DELETE,
            SECRET_IPC_CHANNELS.CLEAR,
        ]))
        expect([...handlers.keys()]).not.toContain('secret:read')

        const saved = await handlers.get(SECRET_IPC_CHANNELS.SAVE)({}, {
            namespace: 'provider',
            id: 'token',
            value: 'renderer-submitted-secret',
        })
        expect(saved.ok).toBe(true)
        expect(JSON.stringify(saved)).not.toContain('renderer-submitted-secret')

        const metadata = await handlers.get(SECRET_IPC_CHANNELS.LIST_METADATA)({}, {namespace: 'provider'})
        expect(metadata.ok).toBe(true)
        expect(metadata.data).toHaveLength(1)
        expect(JSON.stringify(metadata)).not.toContain('renderer-submitted-secret')

        const cleared = await handlers.get(SECRET_IPC_CHANNELS.CLEAR)({}, {namespace: 'provider'})
        expect(cleared).toMatchObject({ok: true, data: {deletedCount: 1}})
    })
})
