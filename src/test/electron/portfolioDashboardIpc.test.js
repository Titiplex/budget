import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipcMain = {
    handle: vi.fn((channel, callback) => {
        handlers.set(channel, callback)
    }),
}
const getPrisma = () => ({
    asset: {},
    portfolio: {},
    liability: {},
    netWorthSnapshot: {},
})
const getPortfolioDashboard = vi.fn(async (options, dependencies) => ({
    options,
    hasPrisma: Boolean(dependencies.prisma),
    kpis: {totalMarketValue: 123},
}))

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerWealthHandlers',
        '../../../electron/db',
        '../../../electron/portfolio/portfolioDashboardService',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installCommonJsMocks() {
    Module._load = function loadWithDashboardIpcMocks(request, parent, isMain) {
        if (request === 'electron') return {ipcMain}
        if (request === '../db' || request.endsWith('/db') || request.endsWith('electron/db')) {
            return {getPrisma}
        }
        if (
            request === '../portfolio/portfolioDashboardService' ||
            request.endsWith('/portfolio/portfolioDashboardService') ||
            request.endsWith('electron/portfolio/portfolioDashboardService')
        ) {
            return {getPortfolioDashboard}
        }

        return originalLoad.apply(this, arguments)
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipcMain.handle.mockClear()
    getPortfolioDashboard.mockClear()
    clearCommonJsCache()
})

describe('portfolio dashboard IPC', () => {
    it('registers a renderer-safe dashboard handler through wealth IPC', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerWealthHandlers} = require('../../../electron/ipc/registerWealthHandlers')
        const prisma = {portfolio: {}, asset: {}, liability: {}, netWorthSnapshot: {}}

        registerWealthHandlers(prisma)

        expect(handlers.has('db:portfolioAnalytics:dashboard')).toBe(true)
        const result = await handlers.get('db:portfolioAnalytics:dashboard')({}, {baseCurrency: 'CAD'})

        expect(getPortfolioDashboard).toHaveBeenCalledWith({baseCurrency: 'CAD'}, {prisma})
        expect(result).toMatchObject({hasPrisma: true, kpis: {totalMarketValue: 123}})
    })
})
