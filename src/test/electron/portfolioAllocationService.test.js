const {
    GROUPING_KEYS,
    calculateAllocationGroups,
    calculatePortfolioAllocations,
} = require('../../../electron/portfolio/portfolioAllocationService')

const positions = [
    {
        id: 1,
        accountId: 10,
        accountName: 'Brokerage CAD',
        assetId: 100,
        marketValue: 600,
        currency: 'CAD',
        valuationCurrency: 'CAD',
        asset: {
            id: 100,
            symbol: 'XEQT',
            name: 'XEQT ETF',
            assetClass: 'ETF',
            sector: 'Diversified',
            geography: 'Global',
            currency: 'CAD',
        },
    },
    {
        id: 2,
        accountId: 10,
        accountName: 'Brokerage CAD',
        assetId: 101,
        marketValue: 300,
        currency: 'CAD',
        valuationCurrency: 'CAD',
        asset: {
            id: 101,
            symbol: 'AAPL',
            name: 'Apple Inc.',
            assetClass: 'EQUITY',
            sector: 'Technology',
            geography: 'United States',
            currency: 'USD',
        },
    },
    {
        id: 3,
        accountId: 11,
        accountName: 'Crypto account',
        assetId: 102,
        marketValue: 100,
        currency: 'CAD',
        valuationCurrency: 'CAD',
        asset: {
            id: 102,
            symbol: 'BTC',
            name: 'Bitcoin',
            assetClass: 'CRYPTO',
            sector: null,
            geography: null,
            currency: 'USD',
        },
    },
    {
        id: 4,
        accountId: 12,
        accountName: 'Private assets',
        assetId: 103,
        marketValue: null,
        currency: 'CAD',
        valuationCurrency: 'CAD',
        asset: {
            id: 103,
            symbol: 'PRIVATE',
            name: 'Private placement',
            assetClass: null,
            sector: null,
            geography: null,
            currency: 'CAD',
        },
    },
]

describe('portfolio allocation service', () => {
    it('calculates stable allocation groups for all supported dimensions', async () => {
        const result = await calculatePortfolioAllocations({
            allocatablePositions: positions,
            baseCurrency: 'CAD',
            totals: {totalMarketValue: 1000},
        })

        expect(Object.keys(result.allocationGroups)).toEqual(GROUPING_KEYS)
        expect(result.allocations.totalAllocatedValue).toBe(1000)
        expect(result.totals).toMatchObject({
            totalAllocatedValue: 1000,
            totalValuedPositions: 3,
            totalMissingValuePositions: 1,
        })
    })

    it('makes asset allocations add up to 100 percent for valued assets only', () => {
        const assetGroups = calculateAllocationGroups(positions, 'asset')
        const totalPercent = assetGroups.reduce((sum, group) => sum + group.allocationPercent, 0)

        expect(totalPercent).toBe(100)
        expect(assetGroups.map((group) => [group.label, group.marketValue, group.allocationPercent])).toEqual([
            ['XEQT ETF', 600, 60],
            ['Apple Inc.', 300, 30],
            ['Bitcoin', 100, 10],
            ['Private placement', 0, 0],
        ])
    })

    it('groups by account, class and currency with position counts', async () => {
        const result = await calculatePortfolioAllocations({
            allocatablePositions: positions,
            baseCurrency: 'CAD',
        })

        expect(result.allocationGroups.account.map((group) => ({
            key: group.key,
            label: group.label,
            marketValue: group.marketValue,
            allocationPercent: group.allocationPercent,
            positionsCount: group.positionsCount,
        }))).toEqual([
            {key: '10', label: 'Brokerage CAD', marketValue: 900, allocationPercent: 90, positionsCount: 2},
            {key: '11', label: 'Crypto account', marketValue: 100, allocationPercent: 10, positionsCount: 1},
            {key: '12', label: 'Private assets', marketValue: 0, allocationPercent: 0, positionsCount: 1},
        ])

        expect(result.allocationGroups.assetClass.map((group) => [group.key, group.marketValue, group.positionsCount])).toEqual([
            ['etf', 600, 1],
            ['equity', 300, 1],
            ['crypto', 100, 1],
            ['unknown', 0, 1],
        ])

        expect(result.allocationGroups.currency.map((group) => [group.key, group.marketValue, group.allocationPercent, group.positionsCount])).toEqual([
            ['CAD', 600, 60, 2],
            ['USD', 400, 40, 2],
        ])
    })

    it('keeps uncategorized assets visible in an unknown bucket', () => {
        const sectorGroups = calculateAllocationGroups(positions, 'sector')
        const geographyGroups = calculateAllocationGroups(positions, 'geography')

        expect(sectorGroups).toEqual(expect.arrayContaining([
            expect.objectContaining({
                key: 'unknown',
                label: 'Non classé',
                marketValue: 100,
                allocationPercent: 10,
                positionsCount: 2,
                unknownCategoryPositionsCount: 2,
                completenessStatus: 'partial',
            }),
        ]))
        expect(geographyGroups).toEqual(expect.arrayContaining([
            expect.objectContaining({
                key: 'unknown',
                marketValue: 100,
                allocationPercent: 10,
                positionsCount: 2,
                completenessStatus: 'partial',
            }),
        ]))
    })

    it('marks groups with missing prices as partial or missing without breaking allocations', () => {
        const classGroups = calculateAllocationGroups(positions, 'assetClass')
        const unknown = classGroups.find((group) => group.key === 'unknown')

        expect(unknown).toMatchObject({
            marketValue: 0,
            allocationPercent: 0,
            positionsCount: 1,
            valuedPositionsCount: 0,
            missingValuePositionsCount: 1,
            completenessStatus: 'missing',
        })
    })

    it('can calculate allocations from raw portfolio inputs through metrics service', async () => {
        const result = await calculatePortfolioAllocations({
            baseCurrency: 'CAD',
            asOf: '2026-04-30',
            positions: [
                {
                    id: 1,
                    accountId: 10,
                    accountName: 'Brokerage',
                    instrumentId: 100,
                    marketInstrumentId: 500,
                    currency: 'USD',
                    instrument: {
                        id: 100,
                        symbol: 'AAPL',
                        name: 'Apple Inc.',
                        assetClass: 'EQUITY',
                        sector: 'Technology',
                        geographicRegion: 'United States',
                        currency: 'USD',
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
                    costBasis: 200,
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
            ],
            movements: [
                {id: 1, type: 'BUY', positionId: 1, quantity: 2, unitPrice: 100, priceCurrency: 'USD', feeAmount: 0, operationDate: '2026-04-01'},
            ],
            priceSnapshots: [
                {id: 1, marketInstrumentId: 500, unitPrice: 150, currency: 'USD', pricedAt: '2026-04-29', freshnessStatus: 'FRESH'},
            ],
            fxRates: {'USD:CAD': 1.25},
        })

        expect(result.totals.totalMarketValue).toBe(375)
        expect(result.allocationGroups.asset).toEqual(expect.arrayContaining([
            expect.objectContaining({label: 'Apple Inc.', marketValue: 375, allocationPercent: 100}),
            expect.objectContaining({label: 'Private asset', marketValue: 0, allocationPercent: 0, completenessStatus: 'missing'}),
        ]))
        expect(result.allocationGroups.currency).toEqual(expect.arrayContaining([
            expect.objectContaining({key: 'USD', marketValue: 375, allocationPercent: 100}),
            expect.objectContaining({key: 'CAD', marketValue: 0, allocationPercent: 0}),
        ]))
    })
})
