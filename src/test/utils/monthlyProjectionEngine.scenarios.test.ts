import {describe, expect, it} from 'vitest'

import {buildMonthlyProjection} from '../../utils/monthlyProjectionEngine'
import {
    buildFixtureProjectionInput,
    demoFinancialGoals,
    demoProjectionScenarios,
} from '../fixtures/goalsProjectionFixtures'

describe('monthly projection scenario fixtures', () => {
    it('compares pessimistic, base and optimistic scenarios deterministically', () => {
        const goal = demoFinancialGoals[0]
        const results = demoProjectionScenarios.map((scenario) => ({
            scenario,
            result: buildMonthlyProjection(buildFixtureProjectionInput(goal, scenario)),
        }))

        expect(results.map(({scenario}) => scenario.kind)).toEqual(['PESSIMISTIC', 'BASE', 'OPTIMISTIC'])
        expect(results.every(({result}) => result.errors.length === 0)).toBe(true)
        expect(results.every(({result}) => result.months.length === 24)).toBe(true)

        const pessimisticFinal = results[0].result.attainmentEstimate.finalProjectedValue
        const baseFinal = results[1].result.attainmentEstimate.finalProjectedValue
        const optimisticFinal = results[2].result.attainmentEstimate.finalProjectedValue

        expect(pessimisticFinal).toBeLessThan(baseFinal)
        expect(baseFinal).toBeLessThan(optimisticFinal)
    })

    it('estimates an earlier reach date for stronger scenarios when the target is reachable', () => {
        const reachableGoal = {
            ...demoFinancialGoals[0],
            targetAmount: 2500,
            startingAmount: 1000,
        }
        const pessimistic = buildMonthlyProjection(buildFixtureProjectionInput(reachableGoal, demoProjectionScenarios[0]))
        const base = buildMonthlyProjection(buildFixtureProjectionInput(reachableGoal, demoProjectionScenarios[1]))
        const optimistic = buildMonthlyProjection(buildFixtureProjectionInput(reachableGoal, demoProjectionScenarios[2]))

        expect(pessimistic.status).toBe('reachable')
        expect(base.status).toBe('reachable')
        expect(optimistic.status).toBe('reachable')

        const optimisticDate = String(optimistic.attainmentEstimate.estimatedReachDate)
        const baseDate = String(base.attainmentEstimate.estimatedReachDate)
        const pessimisticDate = String(pessimistic.attainmentEstimate.estimatedReachDate)

        expect(optimisticDate <= baseDate).toBe(true)
        expect(baseDate <= pessimisticDate).toBe(true)
    })

    it('covers already reached, unreachable, zero contribution and negative growth cases from fixtures', () => {
        const alreadyReached = buildMonthlyProjection(buildFixtureProjectionInput(
            demoFinancialGoals[2],
            demoProjectionScenarios[1],
        ))
        const unreachable = buildMonthlyProjection(buildFixtureProjectionInput(
            demoFinancialGoals[1],
            demoProjectionScenarios[0],
            {horizonMonths: 6},
        ))
        const zeroContribution = buildMonthlyProjection(buildFixtureProjectionInput(
            demoFinancialGoals[0],
            demoProjectionScenarios[1],
            {monthlyContribution: 0},
        ))
        const negativeGrowth = buildMonthlyProjection(buildFixtureProjectionInput(
            demoFinancialGoals[0],
            demoProjectionScenarios[1],
            {annualGrowthRate: -0.1},
        ))

        expect(alreadyReached.status).toBe('alreadyReached')
        expect(alreadyReached.attainmentEstimate.estimatedMonthsToReach).toBe(0)
        expect(unreachable.status).toBe('unreachableWithinHorizon')
        expect(unreachable.attainmentEstimate.withinHorizon).toBe(false)
        expect(zeroContribution.months.every((month) => month.contributionAmount === 0)).toBe(true)
        expect(zeroContribution.status).toBe('unreachableWithinHorizon')
        expect(negativeGrowth.months[0].growthAmount).toBeLessThan(0)
        expect(negativeGrowth.months[negativeGrowth.months.length - 1].projectedValue).toBeGreaterThanOrEqual(0)
    })

    it('rejects invalid amounts cleanly without external services', () => {
        const invalid = buildMonthlyProjection(buildFixtureProjectionInput(
            demoFinancialGoals[0],
            demoProjectionScenarios[1],
            {
                targetAmount: -1,
                monthlyContribution: -10,
                horizonMonths: 0,
            },
        ))

        expect(invalid.status).toBe('invalidInput')
        expect(invalid.months).toEqual([])
        expect(invalid.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
            'invalidTargetAmount',
            'invalidMonthlySurplus',
            'invalidHorizon',
        ]))
    })
})
