import {describe, expect, it} from 'vitest'
import {
    PORTFOLIO_GROUPING_KEYS,
    PORTFOLIO_VALUATION_STATUSES,
    aggregatePortfolioByKey,
    calculatePortfolioAllocationPercentages,
    calculatePortfolioGainLoss,
    isPortfolioGroupingKey,
    isPortfolioValuationStatus,
    normalizePortfolioCurrency,
    roundPortfolioMoney,
    type PortfolioAsset,
    type PortfolioFee,
    type PortfolioIncome,
    type PortfolioMovement,
    type PortfolioPosition,
    type PortfolioSnapshot,
    type PortfolioValuation,
} from '../../types/portfolio'

describe('portfolio analytics shared contracts', () => {
    it('exposes explicit MVP valuation statuses and grouping keys', () => {
        expect(PORTFOLIO_VALUATION_STATUSES).toEqual(['market', 'manual', 'stale', 'missing', 'error'])
        expect(PORTFOLIO_GROUPING_KEYS).toEqual([
            'asset',
            'account',
            'assetClass',
            'sector',
            'geography',
            'currency',
        ])
        expect(isPortfolioValuationStatus('market')).toBe(true)
        expect(isPortfolioValuationStatus('FRESH')).toBe(false)
        expect(isPortfolioGroupingKey('sector')).toBe(true)
        expect(isPortfolioGroupingKey('broker')).toBe(false)
    })

    it('represents dashboard MVP entities without Prisma or Vue dependencies', () => {
        const asset: PortfolioAsset = {
            id: 1,
            symbol: 'XEQT',
            name: 'iShares Core Equity ETF Portfolio',
            assetClass: 'etf',
            sector: 'Diversified',
            geography: 'Global',
            currency: 'CAD',
            marketInstrumentId: 10,
            isActive: true,
            note: null,
        }
        const totalGainLoss = calculatePortfolioGainLoss(1250, 1000, 'CAD')
        const position: PortfolioPosition = {
            id: 100,
            accountId: 20,
            accountName: 'Brokerage',
            assetId: asset.id,
            asset,
            quantity: 25,
            averageCost: 40,
            bookValue: 1000,
            marketValue: 1250,
            currency: 'CAD',
            valuationStatus: 'market',
            valuedAt: '2026-04-30T12:00:00.000Z',
            allocationPercent: 100,
            unrealizedGainLoss: totalGainLoss,
        }
        const movement: PortfolioMovement = {
            id: 200,
            accountId: position.accountId,
            assetId: asset.id,
            type: 'buy',
            quantity: 25,
            unitPrice: 40,
            grossAmount: 1000,
            feeAmount: 5,
            taxAmount: 0,
            netAmount: 1005,
            currency: 'CAD',
            tradeDate: '2026-04-01',
            settledAt: '2026-04-03',
            note: null,
        }
        const valuation: PortfolioValuation = {
            assetId: asset.id,
            accountId: position.accountId,
            quantity: position.quantity,
            unitPrice: 50,
            marketValue: position.marketValue,
            bookValue: position.bookValue,
            currency: 'CAD',
            status: 'market',
            valuedAt: position.valuedAt,
            source: 'market_data',
            warnings: [],
        }
        const income: PortfolioIncome = {
            id: 300,
            accountId: position.accountId,
            assetId: asset.id,
            type: 'dividend',
            amount: 12.5,
            currency: 'CAD',
            paidAt: '2026-04-15',
            withholdingTaxAmount: 0,
            note: null,
        }
        const fee: PortfolioFee = {
            id: 400,
            accountId: position.accountId,
            assetId: asset.id,
            type: 'brokerage',
            amount: 5,
            currency: 'CAD',
            chargedAt: movement.tradeDate,
            note: null,
        }
        const snapshot: PortfolioSnapshot = {
            id: 500,
            baseCurrency: 'CAD',
            capturedAt: '2026-04-30T12:01:00.000Z',
            totalMarketValue: 1250,
            totalBookValue: 1000,
            totalGainLoss,
            positions: [position],
            allocations: [{
                groupBy: 'assetClass',
                key: asset.assetClass,
                label: 'ETF',
                marketValue: position.marketValue || 0,
                currency: 'CAD',
                allocationPercent: 100,
                positionsCount: 1,
            }],
            income: [income],
            fees: [fee],
            valuationStatus: valuation.status,
            warnings: [],
        }

        expect(snapshot.positions[0].asset?.symbol).toBe('XEQT')
        expect(snapshot.totalGainLoss).toEqual({absolute: 250, percent: 25, currency: 'CAD', realized: false})
        expect(snapshot.allocations[0].groupBy).toBe('assetClass')
    })

    it('normalizes currencies, rounds money and computes allocation percentages', () => {
        expect(normalizePortfolioCurrency(' cad ')).toBe('CAD')
        expect(normalizePortfolioCurrency('too-long', 'usd')).toBe('USD')
        expect(roundPortfolioMoney(10.005)).toBe(10.01)
        expect(roundPortfolioMoney(Number.NaN)).toBe(0)

        expect(calculatePortfolioAllocationPercentages([
            {key: 'equity', label: 'Equity', marketValue: 750, currency: 'cad', positionsCount: 2},
            {key: 'cash', label: 'Cash', marketValue: 250, currency: 'CAD', positionsCount: 1},
            {key: 'negative', marketValue: -100, currency: 'CAD'},
        ])).toEqual([
            {key: 'equity', label: 'Equity', marketValue: 750, currency: 'CAD', positionsCount: 2, allocationPercent: 75},
            {key: 'cash', label: 'Cash', marketValue: 250, currency: 'CAD', positionsCount: 1, allocationPercent: 25},
            {key: 'negative', label: 'negative', marketValue: -100, currency: 'CAD', positionsCount: 0, allocationPercent: 0},
        ])
    })

    it('aggregates positions by a provided key without touching storage', () => {
        const positions = [
            {sector: 'Technology', marketValue: 400},
            {sector: 'Financials', marketValue: 250},
            {sector: 'Technology', marketValue: 100},
            {sector: null, marketValue: 50},
        ]
        const grouped = aggregatePortfolioByKey(
            positions,
            (position) => position.sector,
            (position) => position.marketValue,
        )

        expect(grouped.map(({key, count, total}) => ({key, count, total}))).toEqual([
            {key: 'Technology', count: 2, total: 500},
            {key: 'Financials', count: 1, total: 250},
            {key: 'unclassified', count: 1, total: 50},
        ])
    })
})
