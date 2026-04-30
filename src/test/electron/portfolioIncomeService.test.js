const {describe, expect, it} = require('vitest')
const {
    calculatePortfolioIncome,
    normalizePortfolioIncomeEvents,
    resolvePeriod,
} = require('../../../electron/portfolio/portfolioIncomeService')

const movements = [
    {
        id: 1,
        type: 'DIVIDEND',
        cashAmount: 100,
        cashCurrency: 'CAD',
        operationDate: '2026-04-05',
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 100,
        instrument: {symbol: 'XEQT', name: 'XEQT ETF'},
    },
    {
        id: 2,
        type: 'INTEREST',
        cashAmount: 25,
        cashCurrency: 'CAD',
        operationDate: '2026-04-06',
        accountId: 11,
        accountName: 'Savings',
        instrumentId: 101,
        instrument: {symbol: 'CASH', name: 'Cash'},
    },
    {
        id: 3,
        type: 'DISTRIBUTION',
        cashAmount: 40,
        cashCurrency: 'USD',
        operationDate: '2026-04-10',
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 102,
        instrument: {symbol: 'AAPL', name: 'Apple Inc.'},
    },
    {
        id: 4,
        type: 'BUY',
        quantity: 2,
        unitPrice: 100,
        priceCurrency: 'CAD',
        feeAmount: 5,
        feeCurrency: 'CAD',
        operationDate: '2026-04-11',
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 100,
        instrument: {symbol: 'XEQT', name: 'XEQT ETF'},
    },
    {
        id: 5,
        type: 'MANAGEMENT_FEE',
        cashAmount: 12,
        cashCurrency: 'CAD',
        operationDate: '2026-04-15',
        accountId: 10,
        accountName: 'Brokerage',
    },
    {
        id: 6,
        type: 'DIVIDEND',
        cashAmount: 90,
        cashCurrency: 'CAD',
        operationDate: '2026-03-30',
        accountId: 10,
        accountName: 'Brokerage',
        instrumentId: 100,
        instrument: {symbol: 'XEQT', name: 'XEQT ETF'},
    },
]

describe('portfolio income service', () => {
    it('calculates total income, fees and net income for a custom period', async () => {
        const result = await calculatePortfolioIncome({
            baseCurrency: 'CAD',
            startDate: '2026-04-01',
            endDate: '2026-05-01',
            fxRates: {'USD:CAD': 1.25},
            movements,
        })

        expect(result.summary).toMatchObject({
            currency: 'CAD',
            totalIncome: 175,
            totalFees: 17,
            netIncome: 158,
            incomeEventsCount: 3,
            feeEventsCount: 2,
            convertedEventsCount: 5,
            unconvertedEventsCount: 0,
        })
        expect(result.incomeEvents.map((event) => event.type)).toEqual(['dividend', 'interest', 'distribution'])
        expect(result.feeEvents.map((event) => event.type)).toEqual(['buy_fee', 'management'])
    })

    it('keeps fees separated from income and groups by asset and account', async () => {
        const result = await calculatePortfolioIncome({
            baseCurrency: 'CAD',
            startDate: '2026-04-01',
            endDate: '2026-05-01',
            fxRates: {'USD:CAD': 1.25},
            movements,
        })

        expect(result.incomeByAsset).toEqual(expect.arrayContaining([
            expect.objectContaining({key: '100', label: 'XEQT ETF', totalIncome: 100, totalFees: 5, netIncome: 95}),
            expect.objectContaining({key: '102', label: 'Apple Inc.', totalIncome: 50, totalFees: 0, netIncome: 50}),
            expect.objectContaining({key: 'unknown', label: 'Non affecté', totalIncome: 0, totalFees: 12, netIncome: -12}),
        ]))
        expect(result.incomeByAccount).toEqual(expect.arrayContaining([
            expect.objectContaining({key: '10', label: 'Brokerage', totalIncome: 150, totalFees: 17, netIncome: 133}),
            expect.objectContaining({key: '11', label: 'Savings', totalIncome: 25, totalFees: 0, netIncome: 25}),
        ]))
    })

    it('supports current month and current year period filters', async () => {
        expect(resolvePeriod({period: 'currentMonth', now: '2026-04-20'})).toMatchObject({
            period: 'currentMonth',
            startDate: new Date('2026-04-01T00:00:00.000Z'),
            endDate: new Date('2026-05-01T00:00:00.000Z'),
        })
        expect(resolvePeriod({period: 'currentYear', now: '2026-04-20'})).toMatchObject({
            period: 'currentYear',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2027-01-01T00:00:00.000Z'),
        })

        const currentMonth = await calculatePortfolioIncome({
            baseCurrency: 'CAD',
            period: 'currentMonth',
            now: '2026-04-20',
            fxRates: {'USD:CAD': 1.25},
            movements,
        })
        const currentYear = await calculatePortfolioIncome({
            baseCurrency: 'CAD',
            period: 'currentYear',
            now: '2026-04-20',
            fxRates: {'USD:CAD': 1.25},
            movements,
        })

        expect(currentMonth.summary.totalIncome).toBe(175)
        expect(currentYear.summary.totalIncome).toBe(265)
    })

    it('marks multi-currency amounts as unconverted when no FX rate exists', async () => {
        const result = await calculatePortfolioIncome({
            baseCurrency: 'CAD',
            startDate: '2026-04-01',
            endDate: '2026-05-01',
            movements,
        })

        expect(result.summary).toMatchObject({
            totalIncome: 125,
            totalFees: 17,
            netIncome: 108,
            unconvertedEventsCount: 1,
        })
        expect(result.summary.unconvertedByCurrency).toEqual([
            {kind: 'income', currency: 'USD', amount: 40, eventsCount: 1},
        ])
        expect(result.incomeEvents.find((event) => event.originalCurrency === 'USD')).toMatchObject({
            converted: false,
            amount: null,
            conversionError: expect.objectContaining({code: 'FX_RATE_UNAVAILABLE'}),
        })
    })

    it('normalizes capital returns, custody fees and miscellaneous fees', async () => {
        const {events} = await normalizePortfolioIncomeEvents([
            {
                id: 7,
                type: 'CAPITAL_RETURN',
                cashAmount: 15,
                cashCurrency: 'CAD',
                operationDate: '2026-04-21',
                accountId: 10,
                instrumentId: 100,
            },
            {
                id: 8,
                type: 'CUSTODY_FEE',
                cashAmount: 3,
                cashCurrency: 'CAD',
                operationDate: '2026-04-22',
                accountId: 10,
            },
            {
                id: 9,
                type: 'MISC_FEE',
                amount: 2,
                currency: 'CAD',
                operationDate: '2026-04-23',
                accountId: 10,
            },
        ], {
            baseCurrency: 'CAD',
            startDate: '2026-04-01',
            endDate: '2026-05-01',
        })

        expect(events.map((event) => [event.kind, event.type, event.amount])).toEqual([
            ['income', 'capital_return', 15],
            ['fee', 'custody', 3],
            ['fee', 'misc', 2],
        ])
    })
})
