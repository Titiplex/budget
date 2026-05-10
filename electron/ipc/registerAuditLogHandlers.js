const {ipcMain} = require('electron')
const {getPrisma} = require('../db')
const {createAuditLogService} = require('../audit/auditLogService')

const AUDIT_LOG_IPC_CHANNELS = Object.freeze({
    BACKUP_EXPORTED: 'audit:backup:exported',
    RESTORE_DRY_RUN: 'audit:restore:dryRun',
    RESTORE_APPLIED: 'audit:restore:applied',
    RESTORE_FAILED: 'audit:restore:failed',
    RETENTION_POLICY: 'audit:retention:policy',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {
        ok: false,
        data: null,
        error: {
            code: 'AUDIT_LOG_FAILED',
            message: error instanceof Error ? error.message : String(error),
        },
    }
}

function registerSafeAuditLogHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
        try {
            return ok(await handler(payload || {}))
        } catch (error) {
            return fail(error)
        }
    })
}

function createAuditLogHandlers({service = createAuditLogService({prisma: getPrisma()})} = {}) {
    return {
        logBackupExported: (input) => service.logBackupExported(input),
        logRestoreDryRun: (input) => service.logRestoreDryRun(input),
        logRestoreApplied: (input) => service.logRestoreApplied(input),
        logRestoreFailed: (input) => service.logRestoreFailed(input),
        getRetentionPolicy: () => service.getRetentionPolicy(),
    }
}

function registerAuditLogHandlers({ipc = ipcMain, service = createAuditLogService({prisma: getPrisma()})} = {}) {
    const handlers = createAuditLogHandlers({service})

    registerSafeAuditLogHandler(ipc, AUDIT_LOG_IPC_CHANNELS.BACKUP_EXPORTED, handlers.logBackupExported)
    registerSafeAuditLogHandler(ipc, AUDIT_LOG_IPC_CHANNELS.RESTORE_DRY_RUN, handlers.logRestoreDryRun)
    registerSafeAuditLogHandler(ipc, AUDIT_LOG_IPC_CHANNELS.RESTORE_APPLIED, handlers.logRestoreApplied)
    registerSafeAuditLogHandler(ipc, AUDIT_LOG_IPC_CHANNELS.RESTORE_FAILED, handlers.logRestoreFailed)
    registerSafeAuditLogHandler(ipc, AUDIT_LOG_IPC_CHANNELS.RETENTION_POLICY, handlers.getRetentionPolicy)

    return handlers
}

module.exports = {
    AUDIT_LOG_IPC_CHANNELS,
    createAuditLogHandlers,
    fail,
    ok,
    registerAuditLogHandlers,
    registerSafeAuditLogHandler,
}
