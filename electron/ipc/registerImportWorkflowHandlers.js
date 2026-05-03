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
const {
    deleteImportAuditHistory,
    exportImportAuditReport,
    getImportAuditDetail,
    listImportAuditHistory,
    listImportAuditSources,
    toImportAuditIpcError,
} = require('../import/importAuditService')
const {
    restoreImportAuditBackup,
    toImportBackupRestoreIpcError,
} = require('../import/importBackupRestoreService')

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
    AUDIT_SOURCES: 'import:audit:sources',
    AUDIT_DELETE: 'import:audit:delete',
    AUDIT_EXPORT: 'import:audit:export',
    AUDIT_RESTORE_BACKUP: 'import:audit:restoreBackup',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toImportBackupRestoreIpcError(error) || toImportAuditIpcError(error) || toImportWorkflowIpcError(error)}
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
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.HISTORY, (filters) => listImportAuditHistory(store, filters))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.DETAIL, (batchId) => getImportAuditDetail(store, batchId))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.ERRORS, (batchId) => listImportErrors(store, batchId))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.DUPLICATES, (batchId) => listDuplicateCandidates(store, batchId))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.RECONCILE, (input) => applyReconciliationDecisions(store, input))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_SOURCES, () => listImportAuditSources(store))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_DELETE, (batchId, options) => deleteImportAuditHistory(store, batchId, options))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_EXPORT, (batchId, options) => exportImportAuditReport(store, batchId, options))
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_RESTORE_BACKUP, (input) => restoreImportAuditBackup(store, input))

    return {
        applyImport: (input) => applyImport(store, input),
        applyReconciliationDecisions: (input) => applyReconciliationDecisions(store, input),
        cancelImport: (batchId, reason) => cancelImport(store, batchId, reason),
        createImportBatch: (input) => createImportBatch(store, input),
        deleteImportAuditHistory: (batchId, options) => deleteImportAuditHistory(store, batchId, options),
        exportImportAuditReport: (batchId, options) => exportImportAuditReport(store, batchId, options),
        getImportAuditDetail: (batchId) => getImportAuditDetail(store, batchId),
        getImportDetail: (batchId) => getImportDetail(store, batchId),
        listDuplicateCandidates: (batchId) => listDuplicateCandidates(store, batchId),
        listImportAuditHistory: (filters) => listImportAuditHistory(store, filters),
        listImportAuditSources: () => listImportAuditSources(store),
        listImportErrors: (batchId) => listImportErrors(store, batchId),
        listImportHistory: (filters) => listImportHistory(store, filters),
        parseImportFile: (input) => parseImportFile(store, input),
        previewImport: (input) => previewImport(store, input),
        restoreImportAuditBackup: (input) => restoreImportAuditBackup(store, input),
    }
}

module.exports = {
    IMPORT_WORKFLOW_IPC_CHANNELS,
    fail,
    ok,
    registerImportWorkflowHandlers,
    registerSafeImportWorkflowHandler,
}
