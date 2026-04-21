import {describe, expect, it} from 'vitest'
import {
    addRecurringInterval,
    buildRecurringForecast,
    estimateMonthlyEquivalent,
    summarizeRecurringForecast,
} from '../../utils/recurringForecast'
import type {RecurringTransactionTemplate} from '../../types/budget'

function makeTemplate(overrides: Partial<RecurringTransactionTemplate> = {}): RecurringTransactionTemplate {
    return {
        id: 1,
        label: 'Spotify',
        sourceAmount: 15,
        sourceCurrency: 'CAD',
        accountAmount: 15,
        conversionMode: 'NONE',
        exchangeRate: 1,
        exchangeProvider: 'ACCOUNT',
        kind: 'EXPENSE',
        note: null,
        frequency: 'MONTHLY',
        intervalCount: 1,
        startDate: '2026-04-01T00:00:00.000Z',
        nextOccurrenceDate: '2026-04-10T00:00:00.000Z',
        endDate: null,
        isActive: true,
        accountId: 1,
        categoryId: 2,
        account: {
            id: 1,
            name: 'Main',
            type: 'BANK',
            currency: 'CAD',
            description: null,
        },
        category: {
            id: 2,
            name: 'Subscriptions',
            kind: 'EXPENSE',
            color: null,
            description: null,
        },
        ...overrides,
    }
}

describe('recurringForecast utils', () => {
    it('adds recurring intervals correctly', () => {
        expect(addRecurringInterval(new Date('2026-04-01'), 'DAILY', 2).toISOString().slice(0, 10)).toBe('2026-04-03')
        expect(addRecurringInterval(new Date('2026-04-01'), 'WEEKLY', 1).toISOString().slice(0, 10)).toBe('2026-04-08')
        expect(addRecurringInterval(new Date('2026-04-01'), 'MONTHLY', 1).toISOString().slice(0, 10)).toBe('2026-05-01')
        expect(addRecurringInterval(new Date('2026-04-01'), 'YEARLY', 1).toISOString().slice(0, 10)).toBe('2027-04-01')
    })

    it('estimates monthly equivalents', () => {
        expect(estimateMonthlyEquivalent(makeTemplate({frequency: 'MONTHLY', intervalCount: 1}))).toBe(15)
        expect(estimateMonthlyEquivalent(makeTemplate({
            frequency: 'YEARLY',
            intervalCount: 1,
            accountAmount: 120
        }))).toBe(10)
    })

    it('builds a 30-day forecast', () => {
        const templates = [
            makeTemplate({
                nextOccurrenceDate: '2026-04-10T00:00:00.000Z',
                frequency: 'MONTHLY',
            }),
            makeTemplate({
                id: 2,
                label: 'Salary',
                kind: 'INCOME',
                sourceAmount: 3000,
                accountAmount: 3000,
                nextOccurrenceDate: '2026-04-15T00:00:00.000Z',
            }),
        ]

        const forecast = buildRecurringForecast(templates, 30, new Date('2026-04-01T00:00:00.000Z'))

        expect(forecast.length).toBeGreaterThanOrEqual(2)
        expect(forecast[0].plannedDate).toBe('2026-04-10')
    })

    it('summarizes a forecast', () => {
        const templates = [
            makeTemplate(),
            makeTemplate({
                id: 2,
                label: 'Salary',
                kind: 'INCOME',
                sourceAmount: 3000,
                accountAmount: 3000,
            }),
        ]

        const forecast = buildRecurringForecast(templates, 30, new Date('2026-04-01T00:00:00.000Z'))
        const summary = summarizeRecurringForecast(templates, forecast)

        expect(summary.activeCount).toBe(2)
        expect(summary.monthlyExpenseCommitment).toBe(15)
        expect(summary.monthlyIncomeCommitment).toBe(3000)
        expect(summary.upcomingCount).toBeGreaterThan(0)
    })
})