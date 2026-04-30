const {describe, expect, it} = require('vitest')
const {
    calculatePortfolioValuation,
    calculatePositionCost,
    getLatestPriceSnapshot,
} = require('../../../electron/portfolio/portfolioValuationService')

const basePosition = {
    id: 1,
    accountId: 10,
    accountName: 'Brokerage CAD',
    instrumentId: 100,
    marketInstrumentId: 500,
    quantity: 10,
    currency: 'USD',
    instrument: {
        id: 100,
        symbol: 'AAPL',
        name: 'Apple Inc.',
        assetClass: 'EQUITY',
        currency: 'USD',
        marketInstrumentId: 500,
    },
}

describe('portfolio valuation service', () => {
    it('calculates a position value from the latest market snapshot and converts FX', async () => {
        const result = await calculatePortfolioValuation({
            baseCurrency: 'CAD',
            asOf: '2026-04-30T12:00:00.000Z',
            fxRates: {'USD:CAD': {rate: 1.35, provider: 'TEST'}},
            positions: [basePosition],
            movements: [
                {
                    id: 1,
                    type: 'BUY',
                    positionId: 1,
                    quantity: 10,
                    unitPrice: 100,
                    priceCurrency: 'USD',
                    feeAmount: 5,
                    feeCurrency: 'USD',
                    operationDate: '2026-04-01',
                },
            ],
            priceSnapshots: [
                {
                    id: 1,
                    marketInstrumentId: 500,
                    unitPrice: 120,
                    currency: 'USD',
                    pricedAt: '2026-04-29T16:00:00.000Z',
                    freshnessStatus: 'FRESH',
                },
            ],
        })

        expect(result.positions).toHaveLength(1)
        expect(result.positions[0]).toMatchObject({
            quantityHeld: 10,
            averageCost: 135.675,
            investedCost: 1356.75,
            marketValue: 1620,
            valuationSource: 'market',
            valuationStatus: 'market',
            freshnessStatus: 'FRESH',
            allocationPercent: 100,
        })
        expect(result.positions[0].unrealizedGainLoss).toMatchObject({absolute: 263.25, currency: 'CAD'})
        expect(result.totals).toMatchObject({
            totalMarketValue: 1620,
            totalInvestedCost: 1356.75,
            netInvestedCash: 1356.75,
            automaticallyValuedValue: 1620,
            automaticallyValuedPercent: 100,
            unavailableValue: 0,
        })
    })

    it('keeps positions without prices in the portfolio with a clear missing status', async () => {
        const result = await calculatePortfolioValuation({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [
                {
                    ...basePosition,
                    id: 2,
                    quantity: 4,
                    currency: 'CAD',
                    costBasis: 400,
                    marketInstrumentId: null,
                    instrument: {...basePosition.instrument, marketInstrumentId: null, symbol: 'PRIVATE'},
                },
            ],
            movements: [],
            priceSnapshots: [],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 4,
            investedCost: 400,
            marketValue: null,
            unavailableValue: 400,
            valuationSource: 'missing',
            valuationStatus: 'missing',
            freshnessStatus: 'MISSING',
        })
        expect(result.totals).toMatchObject({
            totalMarketValue: 0,
            totalInvestedCost: 400,
            unavailableValue: 400,
            unavailablePositionsCount: 1,
        })
        expect(result.warnings[0].warning).toContain('Aucun prix')
    })

    it('uses manual valuation fallback when no market price is available', async () => {
        const result = await calculatePortfolioValuation({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [
                {
                    ...basePosition,
                    id: 3,
                    currency: 'CAD',
                    quantity: 5,
                    costBasis: 500,
                    manualMarketValue: 650,
                    manualCurrency: 'CAD',
                    marketInstrumentId: 700,
                    instrument: {...basePosition.instrument, symbol: 'MANUAL', marketInstrumentId: 700},
                },
            ],
            movements: [],
            priceSnapshots: [],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 5,
            investedCost: 500,
            marketValue: 650,
            valuationSource: 'manual',
            valuationStatus: 'manual',
        })
        expect(result.totals).toMatchObject({
            totalMarketValue: 650,
            manuallyValuedValue: 650,
            manuallyValuedPercent: 100,
        })
    })

    it('calculates remaining invested cost after a partial sell and buy fees', async () => {
        const cost = await calculatePositionCost(
            basePosition,
            [
                {
                    id: 1,
                    type: 'BUY',
                    positionId: 1,
                    quantity: 10,
                    unitPrice: 100,
                    priceCurrency: 'CAD',
                    feeAmount: 10,
                    feeCurrency: 'CAD',
                    operationDate: '2026-01-01',
                },
                {
                    id: 2,
                    type: 'SELL',
                    positionId: 1,
                    quantity: 4,
                    unitPrice: 150,
                    priceCurrency: 'CAD',
                    feeAmount: 5,
                    feeCurrency: 'CAD',
                    operationDate: '2026-02-01',
                },
            ],
            {baseCurrency: 'CAD', asOf: '2026-04-30'},
        )

        expect(cost).toMatchObject({
            quantity: 6,
            investedCost: 606,
            averageCost: 101,
            netInvestedCash: 415,
        })
    })

    it('isolates FX conversion for movement costs and market values', async () => {
        const result = await calculatePortfolioValuation({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            fxRates: {'USD:CAD': 1.25},
            positions: [basePosition],
            movements: [
                {
                    id: 1,
                    type: 'BUY',
                    positionId: 1,
                    quantity: 2,
                    unitPrice: 100,
                    priceCurrency: 'USD',
                    feeAmount: 4,
                    feeCurrency: 'USD',
                    operationDate: '2026-04-01',
                },
            ],
            priceSnapshots: [
                {
                    id: 1,
                    marketInstrumentId: 500,
                    unitPrice: 110,
                    currency: 'USD',
                    pricedAt: '2026-04-29',
                    freshnessStatus: 'STALE',
                },
            ],
        })

        expect(result.positions[0]).toMatchObject({
            quantityHeld: 2,
            investedCost: 255,
            marketValue: 275,
            valuationStatus: 'stale',
            freshnessStatus: 'STALE',
        })
        expect(result.positions[0].fxRate).toMatchObject({from: 'USD', to: 'CAD', rate: 1.25})
    })

    it('uses the latest snapshot available at the valuation date', () => {
        const snapshot = getLatestPriceSnapshot(
            basePosition,
            [
                {id: 1, marketInstrumentId: 500, unitPrice: 90, pricedAt: '2026-04-01'},
                {id: 2, marketInstrumentId: 500, unitPrice: 95, pricedAt: '2026-04-30'},
                {id: 3, marketInstrumentId: 500, unitPrice: 110, pricedAt: '2026-05-01'},
            ],
            '2026-04-30T23:59:59.000Z',
        )

        expect(snapshot.id).toBe(2)
    })
})
