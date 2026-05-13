import {describe, expect, it} from 'vitest'
import {
    addUtcDays,
    addUtcMonths,
    addUtcWeeks,
    addUtcYears,
    endOfUtcDay,
    startOfUtcDay,
    toDateOnly,
    toUtcDate,
} from '../../utils/date'
import {buildMonthlyProjection} from '../../utils/monthlyProjectionEngine'
import {buildPreviousPeriod, summarizeTransactions, withinRange} from '../../utils/reportComparison'
import {
    projectionDateFixtures,
    reportPeriodFixtures,
    utcMonthAdditionCases,
    utcYearAdditionCases,
} from '../fixtures/dateEdgeCaseFixtures'
import {dateOnly, expectDateOnlySequence, makeReportTransaction, projectionInput} from './dateTestHelpers'

describe('date and timezone regression coverage', () => {
    it('treats date-only strings as UTC calendar days', () => {
        expect(toUtcDate('2026-03-08').toISOString()).toBe('2026-03-08T00:00:00.000Z')
        expect(startOfUtcDay('2026-03-08').toISOString()).toBe('2026-03-08T00:00:00.000Z')
        expect(endOfUtcDay('2026-03-08').toISOString()).toBe('2026-03-08T23:59:59.999Z')
        expect(toDateOnly(new Date('2026-03-08T23:59:59.999Z'))).toBe('2026-03-08')
    })

    it('handles UTC month additions across short months, leap years and year boundaries', () => {
        for (const testCase of utcMonthAdditionCases) {
            expect(dateOnly(addUtcMonths(toUtcDate(testCase.input), testCase.months)), testCase.label).toBe(testCase.expected)
        }
    })

    it('handles UTC year additions from leap days without producing invalid dates', () => {
        for (const testCase of utcYearAdditionCases) {
            expect(dateOnly(addUtcYears(toUtcDate(testCase.input), testCase.years)), testCase.label).toBe(testCase.expected)
        }
    })

    it('keeps weekly and daily arithmetic stable across local DST boundaries', () => {
        expect(dateOnly(addUtcWeeks(toUtcDate('2026-03-08'), 1))).toBe('2026-03-15')
        expect(dateOnly(addUtcWeeks(toUtcDate('2026-03-08'), 2))).toBe('2026-03-22')
        expect(dateOnly(addUtcDays(toUtcDate('2026-03-08'), 1))).toBe('2026-03-09')
    })
})

describe('report period regression coverage', () => {
    it('builds inclusive previous periods for leap February, January and single-day ranges', () => {
        for (const fixture of Object.values(reportPeriodFixtures)) {
            expect(buildPreviousPeriod(fixture.startDate, fixture.endDate)).toEqual({
                previousStartDate: fixture.previousStartDate,
                previousEndDate: fixture.previousEndDate,
                daySpan: fixture.daySpan,
            })
        }
    })

    it('does not shift transaction dates by one day at report boundaries', () => {
        const transactions = [
            makeReportTransaction({id: 1, date: '2026-03-01', kind: 'INCOME', amount: 2_000}),
            makeReportTransaction({id: 2, date: '2026-03-31', kind: 'EXPENSE', amount: 125}),
            makeReportTransaction({id: 3, date: '2026-02-28', kind: 'EXPENSE', amount: 999}),
            makeReportTransaction({id: 4, date: '2026-04-01', kind: 'EXPENSE', amount: 999}),
        ]

        const filtered = transactions.filter((transaction) => withinRange(transaction.date, '2026-03-01', '2026-03-31'))
        const summary = summarizeTransactions(filtered, '2026-03-01', '2026-03-31')

        expect(filtered.map((transaction) => transaction.id)).toEqual([1, 2])
        expect(summary).toMatchObject({
            startDate: '2026-03-01',
            endDate: '2026-03-31',
            transactionCount: 2,
            income: 2_000,
            expense: 125,
            net: 1_875,
        })
    })

    it('includes the full UTC end-of-day but excludes the next UTC calendar day', () => {
        expect(withinRange('2026-03-31', '2026-03-01', '2026-03-31')).toBe(true)
        expect(withinRange('2026-04-01', '2026-03-01', '2026-03-31')).toBe(false)
        expect(withinRange('2026-02-28', '2026-03-01', '2026-03-31')).toBe(false)
    })
})

describe('monthly projection temporal regression coverage', () => {
    it('normalizes a leap-day start to the first day of its month and advances by UTC months', () => {
        const result = buildMonthlyProjection(projectionInput({
            startDate: projectionDateFixtures.leapDayStart.startDate,
            horizonMonths: 3,
        }))

        expect(result.startDate).toBe(projectionDateFixtures.leapDayStart.normalizedStartDate)
        expectDateOnlySequence(result.months.map((month) => month.month), projectionDateFixtures.leapDayStart.months)
    })

    it('projects cleanly across December to January without depending on the runner timezone', () => {
        const result = buildMonthlyProjection(projectionInput({
            startDate: projectionDateFixtures.yearBoundaryStart.startDate,
            horizonMonths: 2,
        }))

        expect(result.startDate).toBe(projectionDateFixtures.yearBoundaryStart.normalizedStartDate)
        expectDateOnlySequence(result.months.map((month) => month.month), projectionDateFixtures.yearBoundaryStart.months)
        expect(result.generatedAt).toBe('2025-12-01T00:00:00.000Z')
    })

    it('keeps estimated reach dates deterministic for month-end starts', () => {
        const result = buildMonthlyProjection(projectionInput({
            startDate: projectionDateFixtures.reachableEstimate.startDate,
            initialValue: 0,
            targetAmount: 300,
            monthlyContribution: 100,
            horizonMonths: 6,
        }))

        expect(result.status).toBe('reachable')
        expect(result.attainmentEstimate.estimatedReachDate).toBe(projectionDateFixtures.reachableEstimate.estimatedReachDate)
        expect(result.attainmentEstimate.estimatedMonthsToReach).toBe(projectionDateFixtures.reachableEstimate.estimatedMonthsToReach)
    })
})
