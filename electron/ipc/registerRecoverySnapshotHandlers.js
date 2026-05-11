const {app, ipcMain} = require('electron')
const {createAuditLogService} = require('../audit/auditLogService')
const {getPrisma} = require('../db')
const {createRecoverySnapshotService} = require('../recovery/recoverySnapshotService')

const RECOVERY_SNAPSHOT_IPC_CHANNELS = Object.freeze({
    CREATE: 'recovery:snapshot:create',
    LIST: 'recovery:snapshot:list',
    READ: 'recovery:snapshot:read',
    DELETE: 'recovery:snapshot:delete',
    RESTORED: 'recovery:snapshot:restored',
    POLICY: 'recovery:snapshot:policy',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {
        ok: false,
        data: null,
        error: {
            code: 'RECOVERY_SNAPSHOT_ERROR',
            message: error instanceof Error ? error.message : String(error),
        },
    }
}

function registerSafeRecoveryHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, ...args) => {
        try {
            return ok(await handler(...args))
        } catch (error) {
            return fail(error)
        }
    })
}

function createRecoverySnapshotHandlers({service} = {}) {
    return {
        createSnapshot: (input) => service.createSnapshot(input || {}),
        listSnapshots: () => service.listSnapshots(),
        readSnapshot: (id) => service.readSnapshot(id),
        deleteSnapshot: (id) => service.deleteSnapshot(id),
        markRestored: (input) => service.markRestored(input || {}),
        getRetentionPolicy: () => service.getRetentionPolicy(),
    }
}

function registerRecoverySnapshotHandlers({
    ipc = ipcMain,
    service = null,
    auditLog = createAuditLogService({prisma: getPrisma()}),
} = {}) {
    const handlers = createRecoverySnapshotHandlers({
        service: service || createRecoverySnapshotService({app, auditLog}),
    })

    registerSafeRecoveryHandler(ipc, RECOVERY_SNAPSHOT_IPC_CHANNELS.CREATE, handlers.createSnapshot)
    registerSafeRecoveryHandler(ipc, RECOVERY_SNAPSHOT_IPC_CHANNELS.LIST, handlers.listSnapshots)
    registerSafeRecoveryHandler(ipc, RECOVERY_SNAPSHOT_IPC_CHANNELS.READ, handlers.readSnapshot)
    registerSafeRecoveryHandler(ipc, RECOVERY_SNAPSHOT_IPC_CHANNELS.DELETE, handlers.deleteSnapshot)
    registerSafeRecoveryHandler(ipc, RECOVERY_SNAPSHOT_IPC_CHANNELS.RESTORED, handlers.markRestored)
    registerSafeRecoveryHandler(ipc, RECOVERY_SNAPSHOT_IPC_CHANNELS.POLICY, handlers.getRetentionPolicy)

    return handlers
}

module.exports = {
    RECOVERY_SNAPSHOT_IPC_CHANNELS,
    createRecoverySnapshotHandlers,
    fail,
    ok,
    registerRecoverySnapshotHandlers,
    registerSafeRecoveryHandler,
}
