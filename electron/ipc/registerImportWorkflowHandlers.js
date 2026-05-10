const {app, ipcMain} = require('electron')
const {createAuditLogService} = require('../audit/auditLogService')
const {createAuditedImportWorkflow} = require('../audit/auditedImportWorkflow')
const {getPrisma} = require('../db')
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

function createBaseImportWorkflow(store) {
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

function registerImportWorkflowHandlers({ipc = ipcMain, store = defaultImportWorkflowStore(app), auditLog = createAuditLogService({prisma: getPrisma()})} = {}) {
    const handlers = createAuditedImportWorkflow({
        base: createBaseImportWorkflow(store),
        auditLog,
    })

    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.CREATE_BATCH, handlers.createImportBatch)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.PARSE_FILE, handlers.parseImportFile)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.PREVIEW, handlers.previewImport)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.APPLY, handlers.applyImport)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.CANCEL, handlers.cancelImport)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.HISTORY, handlers.listImportAuditHistory)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.DETAIL, handlers.getImportAuditDetail)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.ERRORS, handlers.listImportErrors)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.DUPLICATES, handlers.listDuplicateCandidates)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.RECONCILE, handlers.applyReconciliationDecisions)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_SOURCES, handlers.listImportAuditSources)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_DELETE, handlers.deleteImportAuditHistory)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_EXPORT, handlers.exportImportAuditReport)
    registerSafeImportWorkflowHandler(ipc, IMPORT_WORKFLOW_IPC_CHANNELS.AUDIT_RESTORE_BACKUP, handlers.restoreImportAuditBackup)

    return handlers
}

module.exports = {
    IMPORT_WORKFLOW_IPC_CHANNELS,
    createBaseImportWorkflow,
    fail,
    ok,
    registerImportWorkflowHandlers,
    registerSafeImportWorkflowHandler,
}
