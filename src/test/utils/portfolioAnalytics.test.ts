import {describe, expect, it} from 'vitest'
import {
    buildSnapshotFromAnalytics,
    calculatePortfolioAnalytics,
    calculateSnapshotVariation,
} from '../../utils/portfolioAnalytics'
import {
    buildMultiPortfolioFixture,
    buildPortfolioSnapshotPair,
    buildThreeWayAllocationFixture,
    PORTFOLIO_ANALYTICS_CLOCK,
} from '../fixtures/portfolioAnalyticsFixtures'

describe('portfolio analytics regression calculations', () => {
    it('calculates CAD totals by portfolio, asset type, currency and allocation percentages', () => {
        const fixture = buildMultiPortfolioFixture()
        const analytics = calculatePortfolioAnalytics({...fixture, currency: 'CAD'})

        expect(analytics).toMatchObject({
            currency: 'CAD',
            canConsolidate: true,
            totalAssets: 1750,
            totalLiabilities: 300,
            netWorth: 1450,
        })
        expect(analytics.totalsByPortfolio).toEqual({
            '1': {amount: 1750, currency: 'CAD'},
        })
        expect(analytics.totalsByAssetType).toEqual({
            BOND: {amount: 500, currency: 'CAD'},
            CASH: {amount: 250, currency: 'CAD'},
            ETF: {amount: 1000, currency: 'CAD'},
        })
        expect(analytics.totalsByCurrency.CAD).toEqual({
            currency: 'CAD',
            totalAssets: 1750,
            totalLiabilities: 300,
            netWorth: 1450,
        })

        const allocationsByKey = Object.fromEntries(
            analytics.allocation.map((row) => [row.key, row.allocationPercent]),
        )
        expect(allocationsByKey).toEqual({
            'holding-101': 57.14,
            'holding-102': 28.57,
            'portfolio-1-cash': 14.29,
        })
        expect(analytics.allocation.reduce((total, row) => total + row.allocationPercent, 0)).toBe(100)
    })

    it('keeps multi-currency portfolios separated instead of converting implicitly', () => {
        const fixture = buildMultiPortfolioFixture()
        const analytics = calculatePortfolioAnalytics(fixture)

        expect(analytics.currency).toBeNull()
        expect(analytics.canConsolidate).toBe(false)
        expect(analytics.totalAssets).toBeNull()
        expect(analytics.netWorth).toBeNull()
        expect(analytics.currencies).toEqual(['CAD', 'USD'])
        expect(analytics.totalsByCurrency).toEqual({
            CAD: {currency: 'CAD', totalAssets: 1750, totalLiabilities: 300, netWorth: 1450},
            USD: {currency: 'USD', totalAssets: 2100, totalLiabilities: 0, netWorth: 2100},
        })
        expect(analytics.totalsByPortfolio).toEqual({
            '1': {amount: 1750, currency: 'CAD'},
            '2': {amount: 2100, currency: 'USD'},
        })
    })

    it('flags holdings without price and stale market data without calling a provider', () => {
        const fixture = buildMultiPortfolioFixture()
        const analytics = calculatePortfolioAnalytics({...fixture, currency: 'USD'})

        expect(analytics.totalAssets).toBe(2100)
        expect(analytics.missingPriceHoldings).toEqual([
            expect.objectContaining({key: 'holding-202', label: 'Crypto sans prix', amount: 0, hasPrice: false}),
        ])
        expect(analytics.staleHoldings).toEqual([
            expect.objectContaining({key: 'holding-201', label: 'US blue chip', amount: 2000, isStale: true}),
        ])
    })

    it('includes or excludes liabilities according to the requested calculation', () => {
        const fixture = buildMultiPortfolioFixture()
        const withLiabilities = calculatePortfolioAnalytics({...fixture, currency: 'CAD', includeLiabilities: true})
        const withoutLiabilities = calculatePortfolioAnalytics({...fixture, currency: 'CAD', includeLiabilities: false})

        expect(withLiabilities.totalAssets).toBe(1750)
        expect(withLiabilities.totalLiabilities).toBe(300)
        expect(withLiabilities.netWorth).toBe(1450)
        expect(withLiabilities.liabilityRows).toEqual([
            expect.objectContaining({key: 'liability-301', amount: 300}),
        ])

        expect(withoutLiabilities.totalAssets).toBe(1750)
        expect(withoutLiabilities.totalLiabilities).toBe(0)
        expect(withoutLiabilities.netWorth).toBe(1750)
        expect(withoutLiabilities.liabilityRows).toEqual([])
    })

    it('rounds allocations while keeping the allocation sum at 100 percent', () => {
        const fixture = buildThreeWayAllocationFixture()
        const analytics = calculatePortfolioAnalytics({...fixture, currency: 'CAD'})

        expect(analytics.totalAssets).toBe(3)
        expect(analytics.allocation.map((row) => row.allocationPercent)).toEqual([33.34, 33.33, 33.33])
        expect(analytics.allocation.reduce((total, row) => total + row.allocationPercent, 0)).toBe(100)
    })

    it('calculates snapshot variation and asset contribution to the total move', () => {
        const {previous, current} = buildPortfolioSnapshotPair()
        const variation = calculateSnapshotVariation(previous, current)

        expect(variation).toMatchObject({
            previousDate: PORTFOLIO_ANALYTICS_CLOCK.previousSnapshotDate,
            currentDate: PORTFOLIO_ANALYTICS_CLOCK.currentSnapshotDate,
            currency: 'CAD',
            totalAssetsDelta: 300,
            totalLiabilitiesDelta: 50,
            netWorthDelta: 250,
            netWorthPercentChange: 27.78,
        })
        expect(variation.contributions).toEqual([
            expect.objectContaining({key: 'holding-bonds', delta: 100, contributionAmount: 100, contributionPercent: 40}),
            expect.objectContaining({key: 'holding-etf-global', delta: 200, contributionAmount: 200, contributionPercent: 80}),
            expect.objectContaining({key: 'liability-card', delta: 50, contributionAmount: -50, contributionPercent: -20}),
        ])
    })

    it('handles empty analytics and zero-division snapshot changes', () => {
        const analytics = calculatePortfolioAnalytics({portfolios: [], liabilities: [], currency: 'CAD'})

        expect(analytics).toMatchObject({
            currency: 'CAD',
            canConsolidate: true,
            totalAssets: 0,
            totalLiabilities: 0,
            netWorth: 0,
        })
        expect(analytics.allocation).toEqual([])
        expect(analytics.totalsByCurrency).toEqual({})

        const previous = buildSnapshotFromAnalytics(analytics, '2026-01-31T00:00:00.000Z', 'CAD')
        const current = buildSnapshotFromAnalytics(analytics, '2026-02-28T00:00:00.000Z', 'CAD')
        const variation = calculateSnapshotVariation(previous, current)

        expect(variation.netWorthDelta).toBe(0)
        expect(variation.netWorthPercentChange).toBeNull()
        expect(variation.contributions).toEqual([])
    })
})
