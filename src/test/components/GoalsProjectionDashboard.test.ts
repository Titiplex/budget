import {mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import GoalsProjectionDashboard from '../../components/GoalsProjectionDashboard.vue'

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

const baseGoal = {
    id: 1,
    name: 'Fonds urgence',
    type: 'EMERGENCY_FUND',
    targetAmount: 5000,
    currency: 'CAD',
    targetDate: '2026-12-31T00:00:00.000Z',
    startingAmount: 1000,
    status: 'ACTIVE',
    priority: 1,
    notes: 'Simulation locale',
    trackedAssetId: null,
    trackedPortfolioId: null,
    trackedLiabilityId: null,
    baselineNetWorthSnapshotId: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
}

const scenarios = [
    {
        id: 10,
        name: 'Pessimistic',
        kind: 'PESSIMISTIC',
        dbKind: 'CONSERVATIVE',
        description: 'Low path',
        monthlySurplus: 250,
        annualGrowthRate: 0,
        annualInflationRate: 0,
        horizonMonths: 12,
        horizonYears: 1,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
        id: 11,
        name: 'Base',
        kind: 'BASE',
        dbKind: 'BASELINE',
        description: 'Base path',
        monthlySurplus: 500,
        annualGrowthRate: 0,
        annualInflationRate: 0,
        horizonMonths: 12,
        horizonYears: 1,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
        id: 12,
        name: 'Optimistic',
        kind: 'OPTIMISTIC',
        dbKind: 'OPTIMISTIC',
        description: 'High path',
        monthlySurplus: 800,
        annualGrowthRate: 0.04,
        annualInflationRate: 0,
        horizonMonths: 12,
        horizonYears: 1,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
    },
]

function ok<T>(data: T) {
    return Promise.resolve({ok: true, data, error: null})
}

function installGoalsApi(overrides = {}) {
    const api = {
        ensureDefaultProjectionScenarios: vi.fn(() => ok(scenarios)),
        listProjectionScenarios: vi.fn(() => ok(scenarios)),
        listFinancialGoals: vi.fn(() => ok([baseGoal])),
        getFinancialGoal: vi.fn(() => ok(baseGoal)),
        createFinancialGoal: vi.fn((data) => ok({...baseGoal, id: 2, ...data})),
        updateFinancialGoal: vi.fn((id, data) => ok({...baseGoal, id, ...data})),
        deleteFinancialGoal: vi.fn(() => ok({ok: true, id: 1, entityType: 'financialGoal'})),
        estimateMonthlySurplus: vi.fn(() => ok({
            source: 'automaticFromBudget',
            currency: 'CAD',
            monthlyContributionUsed: 500,
            manualMonthlyContribution: null,
            estimatedMonthlySurplus: 500,
            estimatedMonthlyIncome: 3000,
            estimatedMonthlyExpense: 2500,
            netMonthlyEstimate: 500,
            referenceMonth: '2026-05-01',
            historyStartDate: '2026-03-01',
            historyEndDate: '2026-06-01',
            breakdown: {
                budget: {},
                recurring: {},
                historical: {},
            },
            warnings: [],
        })),
        ...overrides,
    }

    Object.defineProperty(window, 'goals', {
        value: api,
        configurable: true,
        writable: true,
    })

    return api
}

describe('GoalsProjectionDashboard', () => {
    beforeEach(() => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        installGoalsApi()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders scenario comparison cards, target chart and neutral disclaimer', async () => {
        const wrapper = mount(GoalsProjectionDashboard, {
            props: {summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        expect(wrapper.text()).toContain('Comparaison des scénarios')
        expect(wrapper.text()).toContain('Pessimiste')
        expect(wrapper.text()).toContain('Base')
        expect(wrapper.text()).toContain('Optimiste')
        expect(wrapper.text()).toContain('Cible')
        expect(wrapper.text()).toContain('ne constitue pas une promesse de rendement')
        expect(wrapper.find('svg[aria-label="Graphique de projection mensuelle"]').exists()).toBe(true)
        expect(wrapper.findAll('polyline')).toHaveLength(3)
    })

    it('opens the optional monthly detail table', async () => {
        const wrapper = mount(GoalsProjectionDashboard, {
            props: {summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        expect(wrapper.text()).not.toContain('Montant restant')
        const toggle = wrapper.findAll('button').find((button) => button.text() === 'Afficher le tableau mensuel')
        expect(toggle).toBeTruthy()
        await toggle!.trigger('click')

        expect(wrapper.text()).toContain('Montant restant')
        expect(wrapper.text()).toContain('Croissance estimée')
        expect(wrapper.text()).toContain('Valeur projetée')
    })
})
