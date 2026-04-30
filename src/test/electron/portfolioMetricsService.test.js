const {describe, expect, it} = require('vitest')
const {
    calculatePortfolioMetrics,
    calculateWeightedAveragePositionMetrics,
} = require('../../../electron/portfolio/portfolioMetricsService')

function position(overrides = {}) {
    return {
        id: 1,
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 100,
        marketInstrumentId: 500,
        quantity: 0,
        currency: 'CAD',
        instrument: {
            id: 100,
            symbol: 'XEQT',
            name: 'XEQT',
            assetClass: 'ETF',
            currency: 'CAD',
            marketInstrumentId: 500,
        },
        ...overrides,
    }
}

function buy(id, quantity, unitPrice, feeAmount = 0, extra = {}) {
    return {
        id,
        type: 'BUY',
        positionId: 1,
        quantity,
        unitPrice,
        priceCurrency: 'CAD',
        feeAmount,
        feeCurrency: 'CAD',
        operationDate: `2026-01-0${id}`,
        ...extra,
    }
}

function sell(id, quantity, unitPrice, feeAmount = 0, extra = {}) {
    return {
        id,
        type: 'SELL',
        positionId: 1,
        quantity,
        unitPrice,
        priceCurrency: 'CAD',
        feeAmount,
        feeCurrency: 'CAD',
        operationDate: `2026-02-0${id}`,
        ...extra,
    }
}

describe('portfolio metrics service', () => {
    it('calculates unrealized gain for a single buy', async () => {
        const result = await calculatePortfolioMetrics({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [position()],
            movements: [buy(1, 10, 100, 0)],
            priceSnapshots: [
                {id: 1, marketInstrumentId: 500, unitPrice: 120, currency: 'CAD', pricedAt: '2026-04-29', freshnessStatus: 'FRESH'},
            ],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 10,
            averageCost: 100,
            investedCost: 1000,
            marketValue: 1200,
            unrealizedGain: 200,
            unrealizedGainPercent: 20,
            realizedGainSimple: 0,
            gainLossTotal: 200,
            costMethod: 'weighted_average',
            isClosed: false,
        })
        expect(result.totals).toMatchObject({
            totalUnrealizedGain: 200,
            totalUnrealizedGainPercent: 20,
            realizedGainSimple: 0,
            totalGainLoss: 200,
            grossReturnSimple: 20,
        })
    })

    it('uses weighted average cost across multiple buys', async () => {
        const result = await calculatePortfolioMetrics({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [position()],
            movements: [buy(1, 10, 100, 0), buy(2, 10, 140, 0)],
            priceSnapshots: [
                {id: 1, marketInstrumentId: 500, unitPrice: 150, currency: 'CAD', pricedAt: '2026-04-29', freshnessStatus: 'FRESH'},
            ],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 20,
            averageCost: 120,
            investedCost: 2400,
            marketValue: 3000,
            unrealizedGain: 600,
            unrealizedGainPercent: 25,
        })
    })

    it('handles partial sells by removing cost basis at weighted average cost', async () => {
        const result = await calculatePortfolioMetrics({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [position()],
            movements: [
                buy(1, 10, 100, 0),
                buy(2, 10, 140, 0),
                sell(3, 5, 160, 10, {operationDate: '2026-03-01'}),
            ],
            priceSnapshots: [
                {id: 1, marketInstrumentId: 500, unitPrice: 150, currency: 'CAD', pricedAt: '2026-04-29', freshnessStatus: 'FRESH'},
            ],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 15,
            averageCost: 120,
            investedCost: 1800,
            marketValue: 2250,
            unrealizedGain: 450,
            realizedCostBasis: 600,
            realizedProceeds: 790,
            realizedGainSimple: 190,
            gainLossTotal: 640,
        })
        expect(result.gainMetrics).toMatchObject({
            totalUnrealizedGain: 450,
            realizedGainSimple: 190,
            totalGainLoss: 640,
            grossReturnSimple: 26.6667,
        })
    })

    it('keeps closed positions with realized gain and zero unrealized gain', async () => {
        const result = await calculatePortfolioMetrics({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [position()],
            movements: [buy(1, 10, 100, 0), sell(2, 10, 130, 0)],
            priceSnapshots: [
                {id: 1, marketInstrumentId: 500, unitPrice: 999, currency: 'CAD', pricedAt: '2026-04-29', freshnessStatus: 'FRESH'},
            ],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 0,
            investedCost: 0,
            marketValue: 0,
            unrealizedGain: 0,
            realizedGainSimple: 300,
            gainLossTotal: 300,
            isClosed: true,
        })
        expect(result.totals).toMatchObject({
            totalUnrealizedGain: 0,
            realizedGainSimple: 300,
            totalGainLoss: 300,
            grossReturnSimple: 30,
        })
    })

    it('does not invent unrealized gains for positions without a price', async () => {
        const result = await calculatePortfolioMetrics({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [position({marketInstrumentId: null, instrument: {symbol: 'PRIVATE', name: 'Private asset', assetClass: 'OTHER', currency: 'CAD', marketInstrumentId: null}})],
            movements: [buy(1, 4, 100, 0)],
            priceSnapshots: [],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 4,
            investedCost: 400,
            marketValue: null,
            unrealizedGain: null,
            unrealizedGainPercent: null,
            realizedGainSimple: 0,
            gainLossTotal: 0,
            valuationStatus: 'missing',
        })
        expect(result.gainMetrics).toMatchObject({
            totalUnrealizedGain: 0,
            totalUnrealizedGainPercent: null,
            incompletePositionsCount: 1,
        })
    })

    it('can calculate weighted-average metrics without running full portfolio valuation', async () => {
        const metrics = await calculateWeightedAveragePositionMetrics(
            position(),
            [buy(1, 3, 100, 3), buy(2, 1, 130, 1), sell(3, 2, 150, 2)],
            {baseCurrency: 'CAD', asOf: '2026-04-30'},
        )

        expect(metrics).toMatchObject({
            quantity: 2,
            remainingCost: 217,
            averageCost: 108.5,
            realizedCostBasis: 217,
            realizedProceeds: 298,
            realizedGain: 81,
            realizedGainPercent: 37.3272,
        })
    })
})
