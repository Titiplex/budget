import {describe, expect, it} from 'vitest'

import {buildMonthlyProjection, type MonthlyProjectionResult} from './monthlyProjectionEngine'
import {
    goalProjectionRegressionFixtures,
    optionalTargetDateProjectionFixture,
    scenarioRegressionFixtures,
} from '../test/fixtures/goalsProjectionFixtures'

function compactMonths(result: MonthlyProjectionResult) {
    return result.months.map((month) => ({
        monthIndex: month.monthIndex,
        month: month.month,
        projectedValue: month.projectedValue,
        contributionAmount: month.contributionAmount,
        growthAmount: month.growthAmount,
        inflationImpactAmount: month.inflationImpactAmount,
        remainingAmount: month.remainingAmount,
        progressPercent: month.progressPercent,
    }))
}

function textSnapshot(result: MonthlyProjectionResult) {
    return [
        `status=${result.status}`,
        `start=${result.startDate}`,
        `reach=${result.attainmentEstimate.estimatedReachDate ?? 'none'}`,
        `months=${result.attainmentEstimate.estimatedMonthsToReach ?? 'none'}`,
        `final=${result.attainmentEstimate.finalProjectedValue}`,
        ...result.months.map((month) => [
            month.monthIndex,
            month.month,
            month.projectedValue,
            month.remainingAmount,
            month.progressPercent,
        ].join('|')),
    ]
}

describe('buildMonthlyProjection regression coverage', () => {
    it('projects a reachable goal with deterministic monthly values and reach date', () => {
        const fixture = goalProjectionRegressionFixtures.reachableWithoutRates
        const result = buildMonthlyProjection(fixture.input)

        expect(result.status).toBe(fixture.expected.status)
        expect(result.scenarioId).toBe(42)
        expect(result.scenarioKind).toBe('base')
        expect(result.currency).toBe('CAD')
        expect(result.generatedAt).toBe('2026-05-01T00:00:00.000Z')
        expect(result.months).toHaveLength(6)
        expect(compactMonths(result).slice(0, 3)).toEqual([
            {
                monthIndex: 1,
                month: '2026-06-01',
                projectedValue: 1500,
                contributionAmount: 500,
                growthAmount: 0,
                inflationImpactAmount: 0,
                remainingAmount: 1000,
                progressPercent: 60,
            },
            {
                monthIndex: 2,
                month: '2026-07-01',
                projectedValue: 2000,
                contributionAmount: 500,
                growthAmount: 0,
                inflationImpactAmount: 0,
                remainingAmount: 500,
                progressPercent: 80,
            },
            {
                monthIndex: 3,
                month: '2026-08-01',
                projectedValue: 2500,
                contributionAmount: 500,
                growthAmount: 0,
                inflationImpactAmount: 0,
                remainingAmount: 0,
                progressPercent: 100,
            },
        ])
        expect(result.attainmentEstimate).toMatchObject({
            estimatedReachDate: fixture.expected.estimatedReachDate,
            estimatedMonthsToReach: fixture.expected.estimatedMonthsToReach,
            finalProjectedValue: fixture.expected.finalProjectedValue,
            shortfallAmount: fixture.expected.shortfallAmount,
            withinHorizon: true,
        })
        expect(result.progress).toMatchObject({
            currentAmount: 4000,
            targetAmount: 2500,
            remainingAmount: 0,
            progressPercent: 100,
            status: 'completed',
        })
    })

    it('returns an already reached goal without monthly rows', () => {
        const fixture = goalProjectionRegressionFixtures.alreadyReached
        const result = buildMonthlyProjection(fixture.input)

        expect(result.status).toBe('alreadyReached')
        expect(result.months).toEqual([])
        expect(result.progress).toMatchObject({
            currentAmount: fixture.expected.finalProjectedValue,
            remainingAmount: 0,
            progressPercent: 100,
            status: 'completed',
        })
        expect(result.attainmentEstimate).toMatchObject({
            estimatedReachDate: fixture.expected.estimatedReachDate,
            estimatedMonthsToReach: fixture.expected.estimatedMonthsToReach,
            finalProjectedValue: fixture.expected.finalProjectedValue,
            shortfallAmount: 0,
            withinHorizon: true,
        })
    })

    it('marks a goal as unreachable when the horizon is too short', () => {
        const fixture = goalProjectionRegressionFixtures.unreachableWithinHorizon
        const result = buildMonthlyProjection(fixture.input)

        expect(result.status).toBe('unreachableWithinHorizon')
        expect(result.months).toHaveLength(3)
        expect(result.months[result.months.length - 1]).toMatchObject({
            month: '2026-08-01',
            projectedValue: fixture.expected.finalProjectedValue,
            remainingAmount: fixture.expected.shortfallAmount,
            progressPercent: 3,
        })
        expect(result.attainmentEstimate).toMatchObject({
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: fixture.expected.finalProjectedValue,
            shortfallAmount: fixture.expected.shortfallAmount,
            withinHorizon: false,
        })
    })

    it('keeps zero monthly contribution deterministic and does not divide by zero', () => {
        const fixture = goalProjectionRegressionFixtures.zeroContributionNoRate
        const result = buildMonthlyProjection(fixture.input)

        expect(result.status).toBe('unreachableWithinHorizon')
        expect(compactMonths(result)).toEqual([
            {
                monthIndex: 1,
                month: '2026-06-01',
                projectedValue: 1000,
                contributionAmount: 0,
                growthAmount: 0,
                inflationImpactAmount: 0,
                remainingAmount: 1000,
                progressPercent: 50,
            },
            {
                monthIndex: 2,
                month: '2026-07-01',
                projectedValue: 1000,
                contributionAmount: 0,
                growthAmount: 0,
                inflationImpactAmount: 0,
                remainingAmount: 1000,
                progressPercent: 50,
            },
            {
                monthIndex: 3,
                month: '2026-08-01',
                projectedValue: 1000,
                contributionAmount: 0,
                growthAmount: 0,
                inflationImpactAmount: 0,
                remainingAmount: 1000,
                progressPercent: 50,
            },
        ])
        expect(result.attainmentEstimate).toMatchObject({
            finalProjectedValue: fixture.expected.finalProjectedValue,
            shortfallAmount: fixture.expected.shortfallAmount,
        })
    })

    it('rejects a negative monthly contribution instead of silently projecting backwards', () => {
        const result = buildMonthlyProjection({
            ...goalProjectionRegressionFixtures.reachableWithoutRates.input,
            monthlyContribution: -50,
        })

        expect(result.status).toBe('invalidInput')
        expect(result.months).toEqual([])
        expect(result.errors).toContainEqual(expect.objectContaining({
            code: 'invalidMonthlySurplus',
            field: 'monthlyContribution',
            recoverable: true,
        }))
    })

    it('covers positive, zero and negative annual rates with stable rounded values', () => {
        const positive = buildMonthlyProjection(goalProjectionRegressionFixtures.positiveAnnualRate.input)
        const zero = buildMonthlyProjection(goalProjectionRegressionFixtures.zeroAnnualRate.input)
        const negative = buildMonthlyProjection(goalProjectionRegressionFixtures.negativeAnnualRate.input)

        expect(compactMonths(positive)).toEqual([
            {
                monthIndex: 1,
                month: '2026-02-01',
                projectedValue: 1110.44,
                contributionAmount: 100,
                growthAmount: 10.44,
                inflationImpactAmount: 0,
                remainingAmount: 389.56,
                progressPercent: 74.0292,
            },
            {
                monthIndex: 2,
                month: '2026-03-01',
                projectedValue: 1221.92,
                contributionAmount: 100,
                growthAmount: 11.49,
                inflationImpactAmount: 0,
                remainingAmount: 278.08,
                progressPercent: 81.4616,
            },
            {
                monthIndex: 3,
                month: '2026-04-01',
                projectedValue: 1334.47,
                contributionAmount: 100,
                growthAmount: 12.54,
                inflationImpactAmount: 0,
                remainingAmount: 165.53,
                progressPercent: 88.9644,
            },
        ])
        expect(compactMonths(zero).map((month) => month.projectedValue)).toEqual([1100, 1200, 1300])
        expect(compactMonths(zero).map((month) => month.growthAmount)).toEqual([0, 0, 0])
        expect(compactMonths(negative)).toEqual([
            expect.objectContaining({projectedValue: 1088.34, growthAmount: -11.66, remainingAmount: 411.66}),
            expect.objectContaining({projectedValue: 1175.75, growthAmount: -12.59, remainingAmount: 324.25}),
            expect.objectContaining({projectedValue: 1262.23, growthAmount: -13.52, remainingAmount: 237.77}),
        ])
        expect(positive.attainmentEstimate).toMatchObject(goalProjectionRegressionFixtures.positiveAnnualRate.expected)
        expect(zero.attainmentEstimate).toMatchObject(goalProjectionRegressionFixtures.zeroAnnualRate.expected)
        expect(negative.attainmentEstimate).toMatchObject(goalProjectionRegressionFixtures.negativeAnnualRate.expected)
    })

    it('validates invalid horizons and reports the field without throwing', () => {
        const fixture = goalProjectionRegressionFixtures.invalidHorizon
        const result = buildMonthlyProjection(fixture.input)

        expect(result.status).toBe('invalidInput')
        expect(result.months).toEqual([])
        expect(result.horizonMonths).toBe(0)
        expect(result.attainmentEstimate).toMatchObject({
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: fixture.expected.finalProjectedValue,
            shortfallAmount: fixture.expected.shortfallAmount,
        })
        expect(result.errors).toContainEqual(expect.objectContaining({
            code: 'invalidHorizon',
            field: 'horizonMonths',
        }))
    })

    it('does not require a target date for monthly projection math', () => {
        const resultWithNullTargetDate = buildMonthlyProjection(optionalTargetDateProjectionFixture.input)
        const {targetDate: _targetDate, ...sameInputWithoutTargetDate} = optionalTargetDateProjectionFixture.input
        const resultWithoutTargetDate = buildMonthlyProjection(sameInputWithoutTargetDate)

        expect(resultWithNullTargetDate.attainmentEstimate).toEqual(resultWithoutTargetDate.attainmentEstimate)
        expect(compactMonths(resultWithNullTargetDate)).toEqual(compactMonths(resultWithoutTargetDate))
    })

    it('uses a fixed fallback clock when startDate is omitted', () => {
        const result = buildMonthlyProjection(goalProjectionRegressionFixtures.withoutStartDate.input)

        expect(result.startDate).toBe('1970-01-01')
        expect(result.generatedAt).toBe('1970-01-01T00:00:00.000Z')
        expect(result.months.map((month) => month.month)).toEqual(['1970-02-01', '1970-03-01'])
        expect(result.attainmentEstimate.finalProjectedValue).toBe(300)
    })

    it('keeps pessimistic, base and optimistic scenarios separate and ordered', () => {
        const results = scenarioRegressionFixtures.map((fixture) => ({
            fixture,
            result: buildMonthlyProjection(fixture.input),
        }))

        expect(results.map(({result}) => result.scenarioKind)).toEqual(['pessimistic', 'base', 'optimistic'])
        expect(results.map(({result}) => result.scenarioId)).toEqual([1, 2, 3])
        expect(results.map(({fixture, result}) => [fixture.name, result.attainmentEstimate.finalProjectedValue])).toEqual([
            ['pessimistic', 1775.27],
            ['base', 1800],
            ['optimistic', 1833.85],
        ])
        expect(results[0].result.attainmentEstimate.finalProjectedValue)
            .toBeLessThan(results[1].result.attainmentEstimate.finalProjectedValue)
        expect(results[1].result.attainmentEstimate.finalProjectedValue)
            .toBeLessThan(results[2].result.attainmentEstimate.finalProjectedValue)
    })

    it('keeps a readable textual regression snapshot for formula changes', () => {
        const result = buildMonthlyProjection(goalProjectionRegressionFixtures.reachableWithoutRates.input)

        expect(textSnapshot(result)).toEqual([
            'status=reachable',
            'start=2026-05-01',
            'reach=2026-08-01',
            'months=3',
            'final=4000',
            '1|2026-06-01|1500|1000|60',
            '2|2026-07-01|2000|500|80',
            '3|2026-08-01|2500|0|100',
            '4|2026-09-01|3000|0|100',
            '5|2026-10-01|3500|0|100',
            '6|2026-11-01|4000|0|100',
        ])
    })
})
