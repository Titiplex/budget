const {ipcMain} = require('electron')

const {getPrisma} = require('../db')
const {
    estimateMonthlySurplus,
    toMonthlySurplusIpcError,
} = require('../goals/monthlySurplusEstimator')

const MONTHLY_SURPLUS_IPC_CHANNELS = Object.freeze({
    ESTIMATE: 'db:goalProjection:monthlySurplus:estimate',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toMonthlySurplusIpcError(error)}
}

function registerSafeMonthlySurplusHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
        try {
            return ok(await handler(payload || {}))
        } catch (error) {
            return fail(error)
        }
    })
}

function registerMonthlySurplusHandlers({ipc = ipcMain, prisma = getPrisma()} = {}) {
    registerSafeMonthlySurplusHandler(ipc, MONTHLY_SURPLUS_IPC_CHANNELS.ESTIMATE, (options) =>
        estimateMonthlySurplus(prisma, options),
    )

    return {
        estimateMonthlySurplus: (options) => estimateMonthlySurplus(prisma, options),
    }
}

module.exports = {
    MONTHLY_SURPLUS_IPC_CHANNELS,
    fail,
    ok,
    registerMonthlySurplusHandlers,
    registerSafeMonthlySurplusHandler,
}
