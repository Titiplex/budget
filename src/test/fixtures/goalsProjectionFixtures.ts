import type {MonthlyProjectionInput} from '../../utils/monthlyProjectionEngine'

export const GOALS_PROJECTION_REFERENCE_DATES = {
    startDate: '2026-05-01',
    targetDate: '2027-05-01',
} as const

export interface ExpectedProjectionSummary {
    status: string
    estimatedReachDate: string | null
    estimatedMonthsToReach: number | null
    finalProjectedValue: number
    shortfallAmount: number
}

export interface GoalsProjectionRegressionFixture {
    name: string
    input: MonthlyProjectionInput
    expected: ExpectedProjectionSummary
}

export const goalProjectionRegressionFixtures = {
    alreadyReached: {
        name: 'already reached emergency fund',
        input: {
            initialValue: 7500,
            targetAmount: 5000,
            monthlyContribution: 0,
            horizonMonths: 12,
            currency: 'CAD',
            scenarioKind: 'base',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expected: {
            status: 'alreadyReached',
            estimatedReachDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
            estimatedMonthsToReach: 0,
            finalProjectedValue: 7500,
            shortfallAmount: 0,
        },
    },
    reachableWithoutRates: {
        name: 'reachable savings target without rates',
        input: {
            initialValue: 1000,
            targetAmount: 2500,
            monthlyContribution: 500,
            horizonMonths: 6,
            currency: 'cad',
            scenarioId: 42,
            scenarioKind: 'base',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expected: {
            status: 'reachable',
            estimatedReachDate: '2026-08-01',
            estimatedMonthsToReach: 3,
            finalProjectedValue: 4000,
            shortfallAmount: 0,
        },
    },
    unreachableWithinHorizon: {
        name: 'unreachable large purchase',
        input: {
            initialValue: 0,
            targetAmount: 10000,
            monthlyContribution: 100,
            horizonMonths: 3,
            currency: 'CAD',
            scenarioKind: 'pessimistic',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expected: {
            status: 'unreachableWithinHorizon',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 300,
            shortfallAmount: 9700,
        },
    },
    zeroContributionNoRate: {
        name: 'zero contribution no rate',
        input: {
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: 0,
            horizonMonths: 3,
            annualGrowthRate: 0,
            currency: 'CAD',
            scenarioKind: 'base',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expected: {
            status: 'unreachableWithinHorizon',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 1000,
            shortfallAmount: 1000,
        },
    },
    positiveAnnualRate: {
        name: 'positive annual growth',
        input: {
            initialValue: 1000,
            targetAmount: 1500,
            monthlyContribution: 100,
            horizonMonths: 3,
            annualGrowthRate: 0.12,
            currency: 'CAD',
            scenarioKind: 'optimistic',
            startDate: '2026-01-01',
        },
        expected: {
            status: 'unreachableWithinHorizon',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 1334.47,
            shortfallAmount: 165.53,
        },
    },
    zeroAnnualRate: {
        name: 'zero annual growth',
        input: {
            initialValue: 1000,
            targetAmount: 1500,
            monthlyContribution: 100,
            horizonMonths: 3,
            annualGrowthRate: 0,
            currency: 'CAD',
            scenarioKind: 'base',
            startDate: '2026-01-01',
        },
        expected: {
            status: 'unreachableWithinHorizon',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 1300,
            shortfallAmount: 200,
        },
    },
    negativeAnnualRate: {
        name: 'negative annual growth',
        input: {
            initialValue: 1000,
            targetAmount: 1500,
            monthlyContribution: 100,
            horizonMonths: 3,
            annualGrowthRate: -0.12,
            currency: 'CAD',
            scenarioKind: 'pessimistic',
            startDate: '2026-01-01',
        },
        expected: {
            status: 'unreachableWithinHorizon',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 1262.23,
            shortfallAmount: 237.77,
        },
    },
    invalidHorizon: {
        name: 'invalid horizon',
        input: {
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: 100,
            horizonMonths: 0,
            currency: 'CAD',
            scenarioKind: 'base',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expected: {
            status: 'invalidInput',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 1000,
            shortfallAmount: 1000,
        },
    },
    withoutStartDate: {
        name: 'no start date fallback',
        input: {
            initialValue: 100,
            targetAmount: 400,
            monthlyContribution: 100,
            horizonMonths: 2,
            currency: 'CAD',
            scenarioKind: 'custom',
        },
        expected: {
            status: 'unreachableWithinHorizon',
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: 300,
            shortfallAmount: 100,
        },
    },
} as const satisfies Record<string, GoalsProjectionRegressionFixture>

export const optionalTargetDateProjectionFixture = {
    name: 'optional target date does not affect monthly math',
    input: {
        initialValue: 1000,
        targetAmount: 2500,
        monthlyContribution: 500,
        horizonMonths: 6,
        currency: 'CAD',
        scenarioKind: 'base',
        startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        targetDate: null,
    },
    expected: goalProjectionRegressionFixtures.reachableWithoutRates.expected,
} as const satisfies GoalsProjectionRegressionFixture & {
    input: MonthlyProjectionInput & {targetDate: string | null}
}

export const scenarioRegressionFixtures = [
    {
        name: 'pessimistic',
        input: {
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: 200,
            horizonMonths: 4,
            annualGrowthRate: -0.02,
            annualInflationRate: 0.03,
            currency: 'CAD',
            scenarioId: 1,
            scenarioKind: 'pessimistic',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expectedFinalProjectedValue: 1775.27,
    },
    {
        name: 'base',
        input: {
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: 200,
            horizonMonths: 4,
            annualGrowthRate: 0,
            annualInflationRate: 0,
            currency: 'CAD',
            scenarioId: 2,
            scenarioKind: 'base',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expectedFinalProjectedValue: 1800,
    },
    {
        name: 'optimistic',
        input: {
            initialValue: 1000,
            targetAmount: 2000,
            monthlyContribution: 200,
            horizonMonths: 4,
            annualGrowthRate: 0.08,
            annualInflationRate: 0.01,
            currency: 'CAD',
            scenarioId: 3,
            scenarioKind: 'optimistic',
            startDate: GOALS_PROJECTION_REFERENCE_DATES.startDate,
        },
        expectedFinalProjectedValue: 1833.85,
    },
] as const satisfies ReadonlyArray<{
    name: string
    input: MonthlyProjectionInput
    expectedFinalProjectedValue: number
}>
