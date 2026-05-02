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

export function buildFixtureProjectionInput(
    goal = demoFinancialGoals[0],
    scenario = demoProjectionScenarios[1],
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
