const {describe, expect, it} = require('vitest')
const {
    buildPortfolioDashboardState,
    getPortfolioDashboard,
    summarizeDataStatus,
} = require('../../../electron/portfolio/portfolioDashboardService')

const positions = [
    {
        id: 1,
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 100,
        marketInstrumentId: 500,
        currency: 'CAD',
        instrument: {
            id: 100,
            symbol: 'XEQT',
            name: 'XEQT ETF',
            assetClass: 'ETF',
            sector: 'Diversified',
            geographicRegion: 'Global',
            currency: 'CAD',
            marketInstrumentId: 500,
        },
    },
    {
        id: 2,
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 101,
        marketInstrumentId: null,
        currency: 'CAD',
        costBasis: 300,
        instrument: {
            id: 101,
            symbol: 'PRIVATE',
            name: 'Private asset',
            assetClass: null,
            sector: null,
            geographicRegion: null,
            currency: 'CAD',
            marketInstrumentId: null,
        },
    },
]

const movements = [
    {id: 1, type: 'BUY', positionId: 1, quantity: 10, unitPrice: 100, priceCurrency: 'CAD', feeAmount: 0, operationDate: '2026-04-01'},
    {id: 2, type: 'DIVIDEND', positionId: 1, instrumentId: 100, accountId: 10, cashAmount: 25, cashCurrency: 'CAD', operationDate: '2026-04-15'},
    {id: 3, type: 'FEE', accountId: 10, cashAmount: 5, cashCurrency: 'CAD', operationDate: '2026-04-16'},
]

const priceSnapshots = [
    {id: 1, marketInstrumentId: 500, unitPrice: 120, currency: 'CAD', pricedAt: '2026-04-29', freshnessStatus: 'FRESH'},
]

describe('portfolio dashboard service', () => {
    it('summarizes data statuses for fresh, stale, manual and missing positions', () => {
        expect(summarizeDataStatus([
            {valuationStatus: 'market'},
            {valuationStatus: 'stale'},
            {valuationStatus: 'manual'},
            {valuationStatus: 'missing'},
            {valuationStatus: 'error'},
        ])).toEqual({fresh: 1, stale: 1, missing: 1, manual: 1, error: 1, total: 5})
    })

    it('builds dashboard-ready KPI, allocation, income and status blocks from raw inputs', async () => {
        const dashboard = await getPortfolioDashboard({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions,
            movements,
            priceSnapshots,
            incomeStartDate: '2026-04-01',
            incomeEndDate: '2026-05-01',
            history: [
                {id: 1, snapshotDate: '2026-04-01', totalMarketValue: 1000, totalInvestedCost: 1000, totalUnrealizedGain: 0, currency: 'CAD', completenessStatus: 'COMPLETE', source: 'MANUAL'},
                {id: 2, snapshotDate: '2026-04-30', totalMarketValue: 1200, totalInvestedCost: 1000, totalUnrealizedGain: 200, currency: 'CAD', completenessStatus: 'PARTIAL', source: 'MANUAL'},
            ],
        })

        expect(dashboard.kpis).toMatchObject({
            totalMarketValue: 1200,
            totalInvestedCost: 1300,
            totalUnrealizedGain: 200,
            periodIncome: 25,
            periodFees: 5,
            netIncome: 20,
        })
        expect(dashboard.dataStatus).toMatchObject({fresh: 1, missing: 1, total: 2})
        expect(dashboard.allocationBlocks.assetClass).toEqual(expect.arrayContaining([
            expect.objectContaining({key: 'etf', marketValue: 1200, allocationPercent: 100}),
            expect.objectContaining({key: 'other', marketValue: 0, allocationPercent: 0, completenessStatus: 'missing'}),
        ]))
        expect(dashboard.history).toHaveLength(2)
        expect(dashboard.isEmpty).toBe(false)
        expect(dashboard.hasNoPrice).toBe(false)
        expect(dashboard.hasHistory).toBe(true)
    })

    it('does not break on an empty portfolio', () => {
        const dashboard = buildPortfolioDashboardState({
            allocations: {positions: [], totals: {}, allocations: {byGroup: {}}},
            income: {summary: {totalIncome: 0, totalFees: 0, netIncome: 0}},
            history: {snapshots: []},
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
        })

        expect(dashboard).toMatchObject({
            isEmpty: true,
            hasNoPrice: false,
            hasHistory: false,
            kpis: {
                totalMarketValue: 0,
                totalInvestedCost: 0,
                totalUnrealizedGain: 0,
                periodIncome: 0,
                periodFees: 0,
                netIncome: 0,
            },
        })
    })
})
