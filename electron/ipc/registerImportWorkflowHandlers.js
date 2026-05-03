const {app, ipcMain} = require('electron')
const {
    applyImport,
    applyReconciliationDecisions,
    cancelImport,
    createImportBatch,
    defaultImportWorkflowStore,
    getImportDetail,
    listDuplicateCandidates,
    listImportErrors,
    listImportHistory,
    parseImportFile,
    previewImport,
    toImportWorkflowIpcError,
} = require('../import/importWorkflowService')

const IMPORT_WORKFLOW_IPC_CHANNELS = Object.freeze({
    CREATE_BATCH: 'import:batch:create',
    PARSE_FILE: 'import:file:parse',
    PREVIEW: 'import:preview:create',
    APPLY: 'import:apply',
    CANCEL: 'import:cancel',
    HISTORY: 'import:history:list',
    DETAIL: 'import:detail:get',
    ERRORS: 'import:errors:list',
    DUPLICATES: 'import:duplicates:list',
    RECONCILE: 'import:reconciliation:apply',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toImportWorkflowIpcError(error)}
}

function registerSafeImportWorkflowHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, ...args) => {
        try {
            return ok(await handler(...args))
        } catch (error) {
            return fail(error)
        }
    })
}

function registerImportWorkflowHandlers({ipc = ipcMain, store = defaultImportWorkflowStore(app)} = {}) {
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.CREATE_BATCH, (input) => createImportBatch(store, input))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.PARSE_FILE, (input) => parseImportFile(store, input))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.PREVIEW, (input) => previewImport(store, input))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.APPLY, (input) => applyImport(store, input))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.CANCEL, (batchId, reason) => cancelImport(store, batchId, reason))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.HISTORY, (filters) => listImportHistory(store, filters))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.DETAIL, (batchId) => getImportDetail(store, batchId))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.ERRORS, (batchId) => listImportErrors(store, batchId))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.DUPLICATES, (batchId) => listDuplicateCandidates(store, batchId))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.RECONCILE, (input) => applyReconciliationDecisions(store, input))

    return {
        applyImport: (input) => applyImport(store, input),
        applyReconciliationDecisions: (input) => applyReconciliationDecisions(store, input),
        cancelImport: (batchId, reason) => cancelImport(store, batchId, reason),
        createImportBatch: (input) => createImportBatch(store, input),
        getImportDetail: (batchId) => getImportDetail(store, batchId),
        listDuplicateCandidates: (batchId) => listDuplicateCandidates(store, batchId),
        listImportErrors: (batchId) => listImportErrors(store, batchId),
        listImportHistory: (filters) => listImportHistory(store, filters),
        parseImportFile: (input) => parseImportFile(store, input),
        previewImport: (input) => previewImport(store, input),
    }
}

module.exports = {
    IMPORT_WORKFLOW_IPC_CHANNELS,
    fail,
    ok,
    registerImportWorkflowHandlers,
    registerSafeImportWorkflowHandler,
}
