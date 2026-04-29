const {ipcMain} = require('electron')

const {getPrisma} = require('../db')
const {
    createMarketDataHandlers,
    toIpcError,
} = require('./marketDataHandlers')

const MARKET_DATA_IPC_CHANNELS = Object.freeze({
    LIST_INSTRUMENTS: 'marketData:instrument:list',
    GET_LATEST_SNAPSHOT: 'marketData:snapshot:latest',
    LIST_SNAPSHOT_HISTORY: 'marketData:snapshot:history',
    REFRESH: 'marketData:refresh',
    GET_VALUATION: 'marketData:valuation:get',
    LIST_FRESHNESS_STATUSES: 'marketData:freshness:list',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toIpcError(error)}
}

function registerSafeHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
        try {
            return ok(await handler(payload))
        } catch (error) {
            return fail(error)
        }
    })
}

function registerMarketDataHandlers({
                                        ipc = ipcMain,
                                        prisma = getPrisma(),
                                        provider = null,
                                        now,
                                    } = {}) {
    const handlers = createMarketDataHandlers({prisma, provider, now})

    registerSafeHandler(ipc, MARKET_DATA_IPC_CHANNELS.LIST_INSTRUMENTS, handlers.listInstruments)
    registerSafeHandler(ipc, MARKET_DATA_IPC_CHANNELS.GET_LATEST_SNAPSHOT, handlers.getLatestSnapshot)
    registerSafeHandler(ipc, MARKET_DATA_IPC_CHANNELS.LIST_SNAPSHOT_HISTORY, handlers.listSnapshotHistory)
    registerSafeHandler(ipc, MARKET_DATA_IPC_CHANNELS.REFRESH, handlers.refresh)
    registerSafeHandler(ipc, MARKET_DATA_IPC_CHANNELS.GET_VALUATION, handlers.getAssetValuation)
    registerSafeHandler(ipc, MARKET_DATA_IPC_CHANNELS.LIST_FRESHNESS_STATUSES, handlers.listFreshnessStatuses)

    return handlers
}

module.exports = {
    MARKET_DATA_IPC_CHANNELS,
    fail,
    ok,
    registerMarketDataHandlers,
    registerSafeHandler,
}
