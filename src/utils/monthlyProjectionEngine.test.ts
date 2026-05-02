import {describe, expect, it} from 'vitest'

import {buildMonthlyProjection} from './monthlyProjectionEngine'

describe('buildMonthlyProjection', () => {
    it('generates a deterministic monthly projection until the target is reached', () => {
        const result = buildMonthlyProjection({
            initialValue: 1000,
            targetAmount: 2500,
            monthlyContribution: 500,
            horizonMonths: 6,
            currency: 'cad',
            scenarioId: 7,
            scenarioKind: 'base',
            startDate: '2026-05-01',
        })

        expect(result.status).toBe('reachable')
        expect(result.scenarioId).toBe(7)
        expect(result.scenarioKind).toBe('base')
        expect(result.currency).toBe('CAD')
        expect(result.generatedAt).toBe('2026-05-01T00:00:00.000Z')
        expect(result.months).toHaveLength(6)
        expect(result.months.slice(0, 3)).toMatchObject([
            {
                monthIndex: 1,
                month: '2026-06-01',
                contributionAmount: 500,
                growthAmount: 0,
                projectedValue: 1500,
                remainingAmount: 1000,
                progressPercent: 60,
            },
            {
                monthIndex: 2,
                month: '2026-07-01',
                projectedValue: 2000,
                remainingAmount: 500,
                progressPercent: 80,
            },
            {
                monthIndex: 3,
                month: '2026-08-01',
                projectedValue: 2500,
                remainingAmount: 0,
                progressPercent: 100,
            },
        ])
        expect(result.attainmentEstimate).toMatchObject({
            estimatedReachDate: '2026-08-01',
            estimatedMonthsToReach: 3,
            withinHorizon: true,
            shortfallAmount: 0,
        })
    })

    it('applies annual growth and inflation monthly', () => {
        const result = buildMonthlyProjection({
            initialValue: 1000,
            targetAmount: 2000,
            monthlySurplus: 100,
            horizonMonths: 2,
            annualGrowthRate: 0.12,
            annualInflationRate: 0.06,
            currency: 'CAD',
            scenarioKind: 'optimistic',
            startDate: '2026-01-01',
        })

        expect(result.status).toBe('unreachableWithinHorizon')
        expect(result.months).toHaveLength(2)
        expect(result.months[0].growthAmount).toBeGreaterThan(0)
        expect(result.months[0].inflationImpactAmount).toBeGreaterThan(0)
        expect(result.months[1].projectedValue).toBeGreaterThan(result.months[0].projectedValue)
        expect(result.attainmentEstimate.withinHorizon).toBe(false)
        expect(result.attainmentEstimate.shortfallAmount).toBeGreaterThan(0)
    })

    it('handles an already reached goal without emitting monthly rows', () => {
        const result = buildMonthlyProjection({
            initialValue: 5000,
            targetAmount: 2500,
            monthlyContribution: 0,
            horizonMonths: 12,
            currency: 'CAD',
            scenarioKind: 'pessimistic',
            startDate: '2026-05-01',
        })

        expect(result.status).toBe('alreadyReached')
        expect(result.months).toEqual([])
        expect(result.progress.status).toBe('completed')
        expect(result.progress.progressPercent).toBe(100)
        expect(result.attainmentEstimate).toMatchObject({
            estimatedReachDate: '2026-05-01',
            estimatedMonthsToReach: 0,
            withinHorizon: true,
        })
    })

    it('marks the goal as unreachable when the horizon is insufficient', () => {
        const result = buildMonthlyProjection({
            initialValue: 0,
            targetAmount: 10000,
            monthlyContribution: 100,
            horizonMonths: 3,
            currency: 'CAD',
            startDate: '2026-05-01',
        })

        expect(result.status).toBe('unreachableWithinHorizon')
        expect(result.months).toHaveLength(3)
        expect(result.attainmentEstimate.estimatedReachDate).toBeNull()
        expect(result.attainmentEstimate.estimatedMonthsToReach).toBeNull()
        expect(result.attainmentEstimate.withinHorizon).toBe(false)
        expect(result.attainmentEstimate.shortfallAmount).toBe(9700)
    })

    it('supports zero contribution with negative growth without becoming negative', () => {
        const result = buildMonthlyProjection({
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: 0,
            horizonMonths: 2,
            annualGrowthRate: -0.12,
            currency: 'CAD',
            startDate: '2026-05-01',
        })

        expect(result.status).toBe('unreachableWithinHorizon')
        expect(result.months[0].contributionAmount).toBe(0)
        expect(result.months[0].growthAmount).toBeLessThan(0)
        expect(result.months[1].projectedValue).toBeGreaterThanOrEqual(0)
    })

    it('rejects negative contributions as invalid input', () => {
        const result = buildMonthlyProjection({
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: -50,
            horizonMonths: 12,
            currency: 'CAD',
            startDate: '2026-05-01',
        })

        expect(result.status).toBe('invalidInput')
        expect(result.months).toEqual([])
        expect(result.errors).toContainEqual(expect.objectContaining({
            code: 'invalidMonthlySurplus',
            field: 'monthlyContribution',
        }))
    })

    it('returns all validation errors without throwing', () => {
        const result = buildMonthlyProjection({
            initialValue: -1,
            targetAmount: 0,
            monthlySurplus: -10,
            horizonMonths: 0,
            annualGrowthRate: 2,
            annualInflationRate: -2,
            currency: 'CAD$',
            startDate: 'not-a-date',
        })

        expect(result.status).toBe('invalidInput')
        expect(result.months).toEqual([])
        expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
            'invalidTargetAmount',
            'invalidMonthlySurplus',
            'invalidHorizon',
            'invalidRate',
            'invalidCurrency',
        ]))
        expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining([
            'initialValue',
            'targetAmount',
            'monthlySurplus',
            'horizonMonths',
            'annualGrowthRate',
            'annualInflationRate',
            'currency',
            'startDate',
        ]))
    })
})
