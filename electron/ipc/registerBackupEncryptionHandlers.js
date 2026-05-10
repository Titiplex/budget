const {ipcMain} = require('electron')

const {
    decryptBackupJson,
    encryptBackupJson,
    parseEncryptedBackup,
    serializeEncryptedBackup,
    toBackupEncryptionIpcError,
} = require('../security/backupEncryption')

const BACKUP_ENCRYPTION_IPC_CHANNELS = Object.freeze({
    ENCRYPT: 'backup:encrypted:encrypt',
    DECRYPT: 'backup:encrypted:decrypt',
    INSPECT: 'backup:encrypted:inspect',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toBackupEncryptionIpcError(error)}
}

function registerSafeBackupEncryptionHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
        try {
            return ok(await handler(payload || {}))
        } catch (error) {
            return fail(error)
        }
    })
}

function createBackupEncryptionHandlers({now = () => new Date()} = {}) {
    return {
        encrypt({backupJson, password, metadata} = {}) {
            const envelope = encryptBackupJson(backupJson, password, {metadata, now})
            return {
                envelope,
                content: serializeEncryptedBackup(envelope),
            }
        },
        decrypt({content, password} = {}) {
            return {
                backupJson: decryptBackupJson(content, password),
            }
        },
        inspect({content} = {}) {
            const envelope = parseEncryptedBackup(content)
            return {
                kind: envelope.kind,
                version: envelope.version,
                cipher: envelope.cipher,
                kdf: envelope.kdf?.name || null,
                createdAt: envelope.createdAt,
                metadata: envelope.metadata || {},
            }
        },
    }
}

function registerBackupEncryptionHandlers({ipc = ipcMain, now} = {}) {
    const handlers = createBackupEncryptionHandlers({now})

    registerSafeBackupEncryptionHandler(ipc, BACKUP_ENCRYPTION_IPC_CHANNELS.ENCRYPT, handlers.encrypt)
    registerSafeBackupEncryptionHandler(ipc, BACKUP_ENCRYPTION_IPC_CHANNELS.DECRYPT, handlers.decrypt)
    registerSafeBackupEncryptionHandler(ipc, BACKUP_ENCRYPTION_IPC_CHANNELS.INSPECT, handlers.inspect)

    return handlers
}

module.exports = {
    BACKUP_ENCRYPTION_IPC_CHANNELS,
    createBackupEncryptionHandlers,
    fail,
    ok,
    registerBackupEncryptionHandlers,
    registerSafeBackupEncryptionHandler,
}
