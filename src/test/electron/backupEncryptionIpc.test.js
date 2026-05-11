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
        '../../../electron/security/backupEncryption',
        '../../../electron/ipc/registerBackupEncryptionHandlers',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installElectronMock() {
    Module._load = function loadWithBackupEncryptionIpcMocks(request) {
        if (request === 'electron') {
            return {ipcMain}
        }
        return originalLoad.apply(this, arguments)
    }
}

function sampleBackupJson() {
    return JSON.stringify({
        kind: 'budget-backup',
        version: 6,
        exportedAt: '2026-05-08T12:00:00.000Z',
        data: {
            accounts: [],
            categories: [],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [],
            taxProfiles: [],
            financialGoals: [],
            projectionScenarios: [],
            projectionSettings: null,
            importBackup: null,
        },
    })
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipcMain.handle.mockClear()
    clearCommonJsCache()
})

describe('encrypted backup IPC handlers', () => {
    it('registers encrypt/decrypt/inspect channels and roundtrips without plaintext files', async () => {
        clearCommonJsCache()
        installElectronMock()
        const {
            BACKUP_ENCRYPTION_IPC_CHANNELS,
            registerBackupEncryptionHandlers,
        } = require('../../../electron/ipc/registerBackupEncryptionHandlers')

        registerBackupEncryptionHandlers({
            ipc: ipcMain,
            now: () => new Date('2026-05-08T12:00:00.000Z'),
        })

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            BACKUP_ENCRYPTION_IPC_CHANNELS.ENCRYPT,
            BACKUP_ENCRYPTION_IPC_CHANNELS.DECRYPT,
            BACKUP_ENCRYPTION_IPC_CHANNELS.INSPECT,
        ]))

        const encrypted = await handlers.get(BACKUP_ENCRYPTION_IPC_CHANNELS.ENCRYPT)({}, {
            backupJson: sampleBackupJson(),
            password: 'safe-password',
            metadata: {source: 'ipc-test'},
        })

        expect(encrypted.ok).toBe(true)
        expect(encrypted.data.content).toContain('budget-encrypted-backup')
        expect(encrypted.data.content).not.toContain('budget-backup","version"')
        expect(encrypted.data.content).not.toContain('safe-password')

        const inspected = await handlers.get(BACKUP_ENCRYPTION_IPC_CHANNELS.INSPECT)({}, {
            content: encrypted.data.content,
        })
        expect(inspected).toMatchObject({
            ok: true,
            data: {
                kind: 'budget-encrypted-backup',
                version: 1,
                cipher: 'aes-256-gcm',
                kdf: 'scrypt',
                createdAt: '2026-05-08T12:00:00.000Z',
                metadata: expect.objectContaining({source: 'ipc-test'}),
            },
        })

        const decrypted = await handlers.get(BACKUP_ENCRYPTION_IPC_CHANNELS.DECRYPT)({}, {
            content: encrypted.data.content,
            password: 'safe-password',
        })

        expect(decrypted).toMatchObject({ok: true, error: null})
        expect(JSON.parse(decrypted.data.backupJson)).toEqual(JSON.parse(sampleBackupJson()))
    })

    it('returns a clean wrongPassword error without throwing through IPC', async () => {
        clearCommonJsCache()
        installElectronMock()
        const {
            BACKUP_ENCRYPTION_IPC_CHANNELS,
            registerBackupEncryptionHandlers,
        } = require('../../../electron/ipc/registerBackupEncryptionHandlers')

        registerBackupEncryptionHandlers({ipc: ipcMain})
        const encrypted = await handlers.get(BACKUP_ENCRYPTION_IPC_CHANNELS.ENCRYPT)({}, {
            backupJson: sampleBackupJson(),
            password: 'right-password',
        })
        const decrypted = await handlers.get(BACKUP_ENCRYPTION_IPC_CHANNELS.DECRYPT)({}, {
            content: encrypted.data.content,
            password: 'wrong-password',
        })

        expect(decrypted).toMatchObject({
            ok: false,
            data: null,
            error: {code: 'wrongPassword', recoverable: true},
        })
    })
})
