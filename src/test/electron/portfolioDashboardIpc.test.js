import {describe, expect, it, vi} from 'vitest'

const handlers = vi.hoisted(() => new Map())

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn((channel, callback) => {
            handlers.set(channel, callback)
        }),
    },
}))

vi.mock('../../../electron/db', () => ({
    getPrisma: () => ({
        asset: {},
        portfolio: {},
        liability: {},
        netWorthSnapshot: {},
    }),
}))

vi.mock('../../../electron/portfolio/portfolioDashboardService', () => ({
    getPortfolioDashboard: vi.fn(async (options, dependencies) => ({
        options,
        hasPrisma: Boolean(dependencies.prisma),
        kpis: {totalMarketValue: 123},
    })),
}))

describe('portfolio dashboard IPC', () => {
    it('registers a renderer-safe dashboard handler through wealth IPC', async () => {
        handlers.clear()
        vi.resetModules()
        const {registerWealthHandlers} = require('../../../electron/ipc/registerWealthHandlers')
        const {getPortfolioDashboard} = require('../../../electron/portfolio/portfolioDashboardService')
        const prisma = {portfolio: {}, asset: {}, liability: {}, netWorthSnapshot: {}}

        registerWealthHandlers(prisma)

        expect(handlers.has('db:portfolioAnalytics:dashboard')).toBe(true)
        const result = await handlers.get('db:portfolioAnalytics:dashboard')({}, {baseCurrency: 'CAD'})

        expect(getPortfolioDashboard).toHaveBeenCalledWith({baseCurrency: 'CAD'}, {prisma})
        expect(result).toMatchObject({hasPrisma: true, kpis: {totalMarketValue: 123}})
    })
})
