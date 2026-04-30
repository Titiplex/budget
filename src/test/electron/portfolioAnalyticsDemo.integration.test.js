const {describe, expect, it} = require('vitest')
const {calculatePortfolioValuation} = require('../../../electron/portfolio/portfolioValuationService')
const {calculatePortfolioMetrics} = require('../../../electron/portfolio/portfolioMetricsService')
const {calculatePortfolioAllocations} = require('../../../electron/portfolio/portfolioAllocationService')
const {calculatePortfolioIncome} = require('../../../electron/portfolio/portfolioIncomeService')
const {
    createMemoryPortfolioSnapshotRepository,
    createPortfolioSnapshot,
    readPortfolioSnapshotHistory,
} = require('../../../electron/portfolio/portfolioHistoryService')
const {getPortfolioDashboard} = require('../../../electron/portfolio/portfolioDashboardService')
const {exportPortfolioDashboardMarkdown} = require('../../../electron/portfolio/portfolioMarkdownExportService')
const {portfolioAnalyticsDemo} = require('../fixtures/portfolioAnalyticsDemo')

function demoInput(extra = {}) {
    return {
        baseCurrency: portfolioAnalyticsDemo.baseCurrency,
        asOf: portfolioAnalyticsDemo.asOf,
        positions: portfolioAnalyticsDemo.positions,
        movements: portfolioAnalyticsDemo.movements,
        priceSnapshots: portfolioAnalyticsDemo.priceSnapshots,
        ...extra,
    }
}

describe('portfolio analytics demo fixture', () => {
    it('covers invested cost, valuation, stale prices and missing prices', async () => {
        const valuation = await calculatePortfolioValuation(demoInput())
        const byId = new Map(valuation.positions.map((position) => [position.id, position]))

        expect(valuation.totals.totalMarketValue).toBe(2870)
        expect(byId.get(1)).toMatchObject({marketValue: 2100, valuationStatus: 'market'})
        expect(byId.get(2)).toMatchObject({marketValue: 270})
        expect(byId.get(4)).toMatchObject({marketValue: null, valuationStatus: 'missing'})
        expect(valuation.warnings.length).toBeGreaterThan(0)
    })

    it('covers weighted average cost, partial sell and latent gains', async () => {
        const metrics = await calculatePortfolioMetrics(demoInput())
        const etf = metrics.positions.find((position) => position.id === 1)
        const shop = metrics.positions.find((position) => position.id === 2)

        expect(etf).toMatchObject({
            quantityHeld: 15,
            averageCost: 110.5,
            investedCost: 1657.5,
            marketValue: 2100,
            unrealizedGain: 442.5,
            realizedCostBasis: 552.5,
            realizedProceeds: 740,
            realizedGainSimple: 187.5,
        })
        expect(shop).toMatchObject({
            quantityHeld: 3,
            investedCost: 242,
            marketValue: 270,
            unrealizedGain: 28,
        })
        expect(metrics.totals.totalUnrealizedGain).toBe(470.5)
    })

    it('covers allocations across asset, class, sector, geography and currency', async () => {
        const allocations = await calculatePortfolioAllocations(demoInput())

        expect(allocations.allocationGroups.asset).toEqual(expect.arrayContaining([
            expect.objectContaining({label: 'iShares Core Equity ETF Portfolio', marketValue: 2100}),
            expect.objectContaining({label: 'Action sans prix', marketValue: 0, completenessStatus: 'missing'}),
        ]))
        expect(allocations.allocationGroups.assetClass).toEqual(expect.arrayContaining([
            expect.objectContaining({key: 'etf', marketValue: 2100}),
            expect.objectContaining({key: 'equity', marketValue: 270, positionsCount: 2, completenessStatus: 'partial'}),
            expect.objectContaining({key: 'cash', marketValue: 500}),
        ]))
        expect(allocations.allocationGroups.currency).toEqual([
            expect.objectContaining({key: 'CAD', marketValue: 2870, allocationPercent: 100, positionsCount: 4}),
        ])
    })

    it('covers dividends, interest and fees for the dashboard period', async () => {
        const income = await calculatePortfolioIncome(demoInput({
            startDate: '2026-04-01',
            endDate: '2026-05-01',
        }))

        expect(income.summary).toMatchObject({
            totalIncome: 27.5,
            totalFees: 7.5,
            netIncome: 20,
            incomeEventsCount: 2,
            feeEventsCount: 1,
        })
        expect(income.incomeByAccount).toEqual(expect.arrayContaining([
            expect.objectContaining({label: 'Compte 10', totalIncome: 27.5, totalFees: 7.5, netIncome: 20}),
        ]))
    })

    it('covers local historical snapshots and partial completeness', async () => {
        const repository = createMemoryPortfolioSnapshotRepository(portfolioAnalyticsDemo.history)
        const created = await createPortfolioSnapshot({
            portfolioId: 1,
            snapshotDate: '2026-04-30',
            source: 'MANUAL',
            portfolioState: await calculatePortfolioMetrics(demoInput()),
            incomeState: await calculatePortfolioIncome(demoInput({startDate: '2026-04-01', endDate: '2026-05-01'})),
        }, {repository})
        const history = await readPortfolioSnapshotHistory({
            portfolioId: 1,
            startDate: '2026-02-01',
            endDate: '2026-05-01',
            currency: 'CAD',
        }, {repository})

        expect(created.snapshot).toMatchObject({completenessStatus: 'PARTIAL', missingValuePositionsCount: 1})
        expect(history.snapshots.map((snapshot) => snapshot.totalMarketValue)).toEqual([1900, 2500, 2870, 2870])
    })

    it('exports a markdown portfolio summary with explicit limitations', async () => {
        const dashboard = await getPortfolioDashboard(demoInput({
            portfolioId: 1,
            incomeStartDate: '2026-04-01',
            incomeEndDate: '2026-05-01',
            history: portfolioAnalyticsDemo.history,
        }))
        const markdown = exportPortfolioDashboardMarkdown(dashboard, {generatedAt: portfolioAnalyticsDemo.asOf})

        expect(dashboard).toMatchObject({
            isEmpty: false,
            hasNoPrice: false,
            hasHistory: true,
            dataStatus: expect.objectContaining({fresh: 1, missing: 1, total: 4}),
        })
        expect(markdown).toContain('# Résumé Portfolio analytics')
        expect(markdown).toContain('Valeur totale du portefeuille')
        expect(markdown).toContain('Prix stale')
        expect(markdown).toContain('Coût moyen pondéré simple')
        expect(markdown).toContain('Action sans prix')
    })
})
