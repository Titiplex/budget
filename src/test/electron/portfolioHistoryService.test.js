const {describe, expect, it} = require('vitest')
const {
    buildPortfolioSnapshot,
    createMemoryPortfolioSnapshotRepository,
    createPortfolioHistoryService,
    createPortfolioSnapshot,
    generateAutomaticPortfolioSnapshotIfNeeded,
    readPortfolioSnapshotHistory,
} = require('../../../electron/portfolio/portfolioHistoryService')

function portfolioState(overrides = {}) {
    return {
        baseCurrency: 'CAD',
        totals: {
            totalMarketValue: 1500,
            totalInvestedCost: 1200,
            totalUnrealizedGain: 300,
            totalValuedPositions: 1,
            totalMissingValuePositions: 0,
            positionsCount: 1,
            ...overrides.totals,
        },
        gainMetrics: {
            totalUnrealizedGain: 300,
        },
        positions: [
            {
                id: 1,
                assetId: 100,
                accountId: 10,
                marketValue: 1500,
                investedCost: 1200,
                valuationStatus: 'market',
            },
        ],
        warnings: [],
        ...overrides,
    }
}

function incomeState(overrides = {}) {
    return {
        summary: {
            totalIncome: 42,
            totalFees: 5,
            netIncome: 37,
            ...overrides.summary,
        },
        warnings: [],
        ...overrides,
    }
}

describe('portfolio history service', () => {
    it('builds a local snapshot payload from portfolio metrics and income aggregates', () => {
        const snapshot = buildPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-04-30', source: 'MANUAL', note: 'Month end'},
            portfolioState(),
            incomeState(),
        )

        expect(snapshot).toMatchObject({
            snapshotKey: '7:2026-04-30:CAD:MANUAL',
            portfolioId: 7,
            periodKey: '2026-04-30',
            source: 'MANUAL',
            currency: 'CAD',
            totalMarketValue: 1500,
            totalInvestedCost: 1200,
            totalUnrealizedGain: 300,
            cumulativeIncome: 42,
            cumulativeFees: 5,
            completenessStatus: 'COMPLETE',
            positionsCount: 1,
            valuedPositionsCount: 1,
            missingValuePositionsCount: 0,
            note: 'Month end',
        })
        expect(JSON.parse(snapshot.payloadJson)).toMatchObject({
            incomeSummary: {totalIncome: 42, totalFees: 5, netIncome: 37},
            positions: [expect.objectContaining({id: 1, marketValue: 1500})],
        })
    })

    it('creates a manual snapshot and reads history by period without external providers', async () => {
        const repository = createMemoryPortfolioSnapshotRepository()
        const created = await createPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-04-15', source: 'MANUAL', portfolioState: portfolioState()},
            {repository},
        )
        await createPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-05-01', source: 'MANUAL', portfolioState: portfolioState({totals: {totalMarketValue: 1600}})},
            {repository},
        )

        const history = await readPortfolioSnapshotHistory(
            {portfolioId: 7, startDate: '2026-04-01', endDate: '2026-05-01', currency: 'CAD'},
            {repository},
        )

        expect(created).toMatchObject({created: true, duplicate: false})
        expect(history.snapshots).toHaveLength(1)
        expect(history.snapshots[0]).toMatchObject({
            portfolioId: 7,
            totalMarketValue: 1500,
            snapshotKey: '7:2026-04-15:CAD:MANUAL',
        })
    })

    it('avoids obvious duplicates for the same portfolio, date, currency and source', async () => {
        const repository = createMemoryPortfolioSnapshotRepository()
        const first = await createPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-04-30', source: 'MANUAL', portfolioState: portfolioState()},
            {repository},
        )
        const duplicate = await createPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-04-30', source: 'MANUAL', portfolioState: portfolioState({totals: {totalMarketValue: 9999}})},
            {repository},
        )

        expect(first.created).toBe(true)
        expect(duplicate).toMatchObject({created: false, duplicate: true, replaced: false})
        expect(duplicate.snapshot.totalMarketValue).toBe(1500)
        expect(repository._all()).toHaveLength(1)
    })

    it('can replace a duplicate snapshot when explicitly requested', async () => {
        const repository = createMemoryPortfolioSnapshotRepository()
        await createPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-04-30', source: 'MANUAL', portfolioState: portfolioState()},
            {repository},
        )
        const replacement = await createPortfolioSnapshot(
            {
                portfolioId: 7,
                snapshotDate: '2026-04-30',
                source: 'MANUAL',
                replaceDuplicate: true,
                portfolioState: portfolioState({totals: {totalMarketValue: 1750, totalInvestedCost: 1300, totalUnrealizedGain: 450}}),
            },
            {repository},
        )

        expect(replacement).toMatchObject({created: false, duplicate: true, replaced: true})
        expect(replacement.snapshot).toMatchObject({
            totalMarketValue: 1750,
            totalInvestedCost: 1300,
            totalUnrealizedGain: 450,
        })
        expect(repository._all()).toHaveLength(1)
    })

    it('keeps partial snapshots usable when some assets have missing values', async () => {
        const repository = createMemoryPortfolioSnapshotRepository()
        const partialState = portfolioState({
            totals: {
                totalMarketValue: 1500,
                totalInvestedCost: 1800,
                totalUnrealizedGain: 300,
                totalValuedPositions: 1,
                totalMissingValuePositions: 1,
                positionsCount: 2,
            },
            positions: [
                {id: 1, assetId: 100, accountId: 10, marketValue: 1500, investedCost: 1200, valuationStatus: 'market'},
                {id: 2, assetId: 101, accountId: 10, marketValue: null, investedCost: 600, valuationStatus: 'missing'},
            ],
        })

        const result = await createPortfolioSnapshot(
            {portfolioId: 7, snapshotDate: '2026-04-30', source: 'MANUAL', portfolioState: partialState},
            {repository},
        )

        expect(result.snapshot).toMatchObject({
            completenessStatus: 'PARTIAL',
            positionsCount: 2,
            valuedPositionsCount: 1,
            missingValuePositionsCount: 1,
        })
        expect(result.snapshot.payload.positions).toEqual(expect.arrayContaining([
            expect.objectContaining({id: 2, completenessStatus: 'MISSING'}),
        ]))
    })

    it('generates automatic snapshots with a separate anti-duplicate key from manual snapshots', async () => {
        const repository = createMemoryPortfolioSnapshotRepository()
        const service = createPortfolioHistoryService({repository})
        await service.createPortfolioSnapshot({portfolioId: 7, snapshotDate: '2026-04-30', source: 'MANUAL', portfolioState: portfolioState()})
        const generated = await service.generateAutomaticPortfolioSnapshotIfNeeded({
            portfolioId: 7,
            snapshotDate: '2026-04-30',
            portfolioState: portfolioState({totals: {totalMarketValue: 1600}}),
        })
        const duplicateGenerated = await generateAutomaticPortfolioSnapshotIfNeeded({
            portfolioId: 7,
            snapshotDate: '2026-04-30',
            portfolioState: portfolioState({totals: {totalMarketValue: 1700}}),
        }, {repository})

        expect(generated).toMatchObject({created: true, duplicate: false})
        expect(duplicateGenerated).toMatchObject({created: false, duplicate: true})
        expect(repository._all().map((snapshot) => snapshot.snapshotKey).sort()).toEqual([
            '7:2026-04-30:CAD:GENERATED',
            '7:2026-04-30:CAD:MANUAL',
        ])
    })
})
