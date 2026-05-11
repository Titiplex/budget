const {ipcMain} = require('electron')
const {getPrisma} = require('../db')
const {createAuditLogService} = require('../audit/auditLogService')
const {createIntegrityCheckService} = require('../integrity/integrityCheckService')

const INTEGRITY_CHECK_IPC_CHANNELS = Object.freeze({
    RUN: 'integrity:check:run',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {
        ok: false,
        data: null,
        error: {
            code: 'INTEGRITY_CHECK_FAILED',
            message: error instanceof Error ? error.message : String(error),
        },
    }
}

function registerSafeIntegrityCheckHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
        try {
            return ok(await handler(payload || {}))
        } catch (error) {
            return fail(error)
        }
    })
}

function createIntegrityCheckHandlers({service = createIntegrityCheckService({prisma: getPrisma()})} = {}) {
    return {
        runIntegrityCheck: (input = {}) => service.run({
            ...input,
            source: input.source || 'manual-ipc',
            reason: input.reason || 'manual-check',
        }),
    }
}

function registerIntegrityCheckHandlers({ipc = ipcMain, service = null, auditLog = null} = {}) {
    const prisma = service ? null : getPrisma()
    const resolvedAuditLog = auditLog || (service ? null : createAuditLogService({prisma}))
    const handlers = createIntegrityCheckHandlers({
        service: service || createIntegrityCheckService({prisma, auditLog: resolvedAuditLog}),
    })

    registerSafeIntegrityCheckHandler(ipc, INTEGRITY_CHECK_IPC_CHANNELS.RUN, handlers.runIntegrityCheck)

    return handlers
}

module.exports = {
    INTEGRITY_CHECK_IPC_CHANNELS,
    createIntegrityCheckHandlers,
    fail,
    ok,
    registerIntegrityCheckHandlers,
    registerSafeIntegrityCheckHandler,
}
