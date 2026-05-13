import type {
    PortfolioAnalyticsLiability,
    PortfolioAnalyticsPortfolio,
    PortfolioAnalyticsSnapshot,
} from '../../utils/portfolioAnalytics'

export const PORTFOLIO_ANALYTICS_CLOCK = Object.freeze({
    previousSnapshotDate: '2026-04-30T00:00:00.000Z',
    currentSnapshotDate: '2026-05-31T00:00:00.000Z',
    stalePriceDate: '2026-03-31T00:00:00.000Z',
})

export function buildMultiPortfolioFixture(): {
    portfolios: PortfolioAnalyticsPortfolio[]
    liabilities: PortfolioAnalyticsLiability[]
} {
    return {
        portfolios: [
            {
                id: 1,
                name: 'CELI long terme',
                type: 'RETIREMENT',
                currency: 'CAD',
                cashBalance: 250,
                holdings: [
                    {
                        id: 101,
                        portfolioId: 1,
                        name: 'ETF global CAD',
                        assetClass: 'ETF',
                        currency: 'CAD',
                        marketValue: 1000,
                        costBasis: 900,
                        priceFreshnessStatus: 'FRESH',
                    },
                    {
                        id: 102,
                        portfolioId: 1,
                        name: 'Obligations CAD',
                        assetClass: 'BOND',
                        currency: 'CAD',
                        quantity: 4,
                        unitPrice: 125,
                        costBasis: 480,
                        priceFreshnessStatus: 'FRESH',
                    },
                ],
            },
            {
                id: 2,
                name: 'Brokerage USD',
                type: 'TAXABLE_BROKERAGE',
                currency: 'USD',
                cashBalance: 100,
                holdings: [
                    {
                        id: 201,
                        portfolioId: 2,
                        name: 'US blue chip',
                        assetClass: 'EQUITY',
                        currency: 'USD',
                        marketValue: 2000,
                        costBasis: 1800,
                        marketInstrument: {freshnessStatus: 'STALE'},
                    },
                    {
                        id: 202,
                        portfolioId: 2,
                        name: 'Crypto sans prix',
                        assetClass: 'CRYPTO',
                        currency: 'USD',
                        quantity: 3,
                        unitPrice: null,
                        costBasis: 300,
                        priceFreshnessStatus: 'UNKNOWN',
                    },
                ],
            },
        ],
        liabilities: [
            {
                id: 301,
                name: 'Carte de crédit',
                type: 'CREDIT_CARD',
                currency: 'CAD',
                currentBalance: 300,
                includeInNetWorth: true,
            },
            {
                id: 302,
                name: 'Hypothèque suivie hors portefeuille',
                type: 'MORTGAGE',
                currency: 'CAD',
                currentBalance: 1000,
                includeInNetWorth: false,
            },
        ],
    }
}

export function buildThreeWayAllocationFixture(): {
    portfolios: PortfolioAnalyticsPortfolio[]
    liabilities: PortfolioAnalyticsLiability[]
} {
    return {
        portfolios: [
            {
                id: 'rounding',
                name: 'Allocation tiers',
                type: 'TAXABLE_BROKERAGE',
                currency: 'CAD',
                cashBalance: 0,
                holdings: [
                    {id: 'a', portfolioId: 'rounding', name: 'A', assetClass: 'ETF', currency: 'CAD', marketValue: 1},
                    {id: 'b', portfolioId: 'rounding', name: 'B', assetClass: 'EQUITY', currency: 'CAD', marketValue: 1},
                    {id: 'c', portfolioId: 'rounding', name: 'C', assetClass: 'BOND', currency: 'CAD', marketValue: 1},
                ],
            },
        ],
        liabilities: [],
    }
}

export function buildPortfolioSnapshotPair(): {
    previous: PortfolioAnalyticsSnapshot
    current: PortfolioAnalyticsSnapshot
} {
    return {
        previous: {
            snapshotDate: PORTFOLIO_ANALYTICS_CLOCK.previousSnapshotDate,
            currency: 'CAD',
            totalAssets: 1000,
            totalLiabilities: 100,
            netWorth: 900,
            breakdown: [
                {
                    key: 'holding-etf-global',
                    entityType: 'holding',
                    id: 101,
                    label: 'ETF global CAD',
                    type: 'ETF',
                    amount: 700,
                    currency: 'CAD',
                },
                {
                    key: 'holding-bonds',
                    entityType: 'holding',
                    id: 102,
                    label: 'Obligations CAD',
                    type: 'BOND',
                    amount: 300,
                    currency: 'CAD',
                },
                {
                    key: 'liability-card',
                    entityType: 'liability',
                    id: 301,
                    label: 'Carte de crédit',
                    type: 'CREDIT_CARD',
                    amount: 100,
                    currency: 'CAD',
                },
            ],
        },
        current: {
            snapshotDate: PORTFOLIO_ANALYTICS_CLOCK.currentSnapshotDate,
            currency: 'CAD',
            totalAssets: 1300,
            totalLiabilities: 150,
            netWorth: 1150,
            breakdown: [
                {
                    key: 'holding-etf-global',
                    entityType: 'holding',
                    id: 101,
                    label: 'ETF global CAD',
                    type: 'ETF',
                    amount: 900,
                    currency: 'CAD',
                },
                {
                    key: 'holding-bonds',
                    entityType: 'holding',
                    id: 102,
                    label: 'Obligations CAD',
                    type: 'BOND',
                    amount: 400,
                    currency: 'CAD',
                },
                {
                    key: 'liability-card',
                    entityType: 'liability',
                    id: 301,
                    label: 'Carte de crédit',
                    type: 'CREDIT_CARD',
                    amount: 150,
                    currency: 'CAD',
                },
            ],
        },
    }
}
