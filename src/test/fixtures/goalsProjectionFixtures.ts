import type {MonthlyProjectionInput} from '../../utils/monthlyProjectionEngine'

export const demoFinancialGoals = [
    {
        id: 1,
        name: 'Fonds d’urgence démo',
        type: 'EMERGENCY_FUND' as const,
        targetAmount: 6000,
        currency: 'CAD',
        targetDate: '2027-05-01',
        startingAmount: 1000,
        status: 'ACTIVE' as const,
        priority: 1,
        notes: 'Fixture locale. Pas un conseil financier.',
    },
    {
        id: 2,
        name: 'Apport maison démo',
        type: 'PURCHASE' as const,
        targetAmount: 25000,
        currency: 'CAD',
        targetDate: '2029-05-01',
        startingAmount: 5000,
        status: 'ACTIVE' as const,
        priority: 2,
        notes: 'Fixture pour projections multi-scénarios.',
    },
    {
        id: 3,
        name: 'Objectif déjà atteint démo',
        type: 'SAVINGS' as const,
        targetAmount: 1000,
        currency: 'CAD',
        targetDate: null,
        startingAmount: 1500,
        status: 'COMPLETED' as const,
        priority: 3,
        notes: 'Fixture cas limite alreadyReached.',
    },
]

export const demoProjectionScenarios = [
    {
        id: 10,
        name: 'Démo pessimiste',
        kind: 'PESSIMISTIC' as const,
        description: 'Surplus plus faible, croissance faible, inflation plus élevée.',
        monthlySurplus: 250,
        annualGrowthRate: 0.01,
        annualInflationRate: 0.03,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Hypothèse de test déterministe; pas une prévision.',
    },
    {
        id: 11,
        name: 'Démo base',
        kind: 'BASE' as const,
        description: 'Surplus et croissance intermédiaires.',
        monthlySurplus: 500,
        annualGrowthRate: 0.03,
        annualInflationRate: 0.02,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Hypothèse de test déterministe; pas une prévision.',
    },
    {
        id: 12,
        name: 'Démo optimiste',
        kind: 'OPTIMISTIC' as const,
        description: 'Surplus plus élevé et croissance supérieure.',
        monthlySurplus: 750,
        annualGrowthRate: 0.05,
        annualInflationRate: 0.02,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Hypothèse de test déterministe; pas une prévision.',
    },
]

type DemoFinancialGoal = typeof demoFinancialGoals[number]
type DemoProjectionScenario = typeof demoProjectionScenarios[number]

export function buildFixtureProjectionInput(
    goal: DemoFinancialGoal = demoFinancialGoals[0],
    scenario: DemoProjectionScenario = demoProjectionScenarios[1],
    overrides: Partial<MonthlyProjectionInput> = {},
): MonthlyProjectionInput {
    return {
        initialValue: goal.startingAmount ?? 0,
        targetAmount: goal.targetAmount,
        monthlyContribution: scenario.monthlySurplus,
        horizonMonths: scenario.horizonMonths,
        annualGrowthRate: scenario.annualGrowthRate,
        annualInflationRate: scenario.annualInflationRate,
        currency: goal.currency,
        scenarioId: scenario.id,
        scenarioKind: scenario.kind === 'PESSIMISTIC'
            ? 'pessimistic'
            : scenario.kind === 'OPTIMISTIC'
                ? 'optimistic'
                : 'base',
        startDate: '2026-05-01',
        ...overrides,
    }
}

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
