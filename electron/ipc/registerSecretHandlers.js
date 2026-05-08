const {app, ipcMain, safeStorage} = require('electron')

const {
    createSecretStore,
    toSecretStoreIpcError,
} = require('../security/secretStore')

const SECRET_IPC_CHANNELS = Object.freeze({
    GET_STORAGE_INFO: 'secret:storage:info',
    SAVE: 'secret:save',
    HAS: 'secret:has',
    LIST_METADATA: 'secret:metadata:list',
    DELETE: 'secret:delete',
    CLEAR: 'secret:clear',
})

let defaultSecretStore = null

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toSecretStoreIpcError(error)}
}

function registerSafeSecretHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
        try {
            return ok(await handler(payload))
        } catch (error) {
            return fail(error)
        }
    })
}

function getDefaultSecretStore() {
    if (!defaultSecretStore) {
        defaultSecretStore = createSecretStore({app, safeStorage})
    }
    return defaultSecretStore
}

function createSecretHandlers({store = getDefaultSecretStore()} = {}) {
    return {
        getStorageInfo: () => store.getStorageInfo(),
        saveSecret: (input) => store.saveSecret(input),
        hasSecret: (input) => store.hasSecret(input),
        listSecretMetadata: (input) => store.listSecretMetadata(input),
        deleteSecret: (input) => store.deleteSecret(input),
        clearSecrets: (input) => store.clearSecrets(input),
    }
}

function registerSecretHandlers({ipc = ipcMain, store = getDefaultSecretStore()} = {}) {
    const handlers = createSecretHandlers({store})

    registerSafeSecretHandler(ipc, SECRET_IPC_CHANNELS.GET_STORAGE_INFO, handlers.getStorageInfo)
    registerSafeSecretHandler(ipc, SECRET_IPC_CHANNELS.SAVE, handlers.saveSecret)
    registerSafeSecretHandler(ipc, SECRET_IPC_CHANNELS.HAS, handlers.hasSecret)
    registerSafeSecretHandler(ipc, SECRET_IPC_CHANNELS.LIST_METADATA, handlers.listSecretMetadata)
    registerSafeSecretHandler(ipc, SECRET_IPC_CHANNELS.DELETE, handlers.deleteSecret)
    registerSafeSecretHandler(ipc, SECRET_IPC_CHANNELS.CLEAR, handlers.clearSecrets)

    return handlers
}

function resetDefaultSecretStoreForTests() {
    defaultSecretStore = null
}

module.exports = {
    SECRET_IPC_CHANNELS,
    createSecretHandlers,
    fail,
    ok,
    registerSafeSecretHandler,
    registerSecretHandlers,
    resetDefaultSecretStoreForTests,
}
