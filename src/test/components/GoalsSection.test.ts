import {mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import GoalsSection from '../../components/GoalsSection.vue'

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

const baseScenario = {
    id: 10,
    name: 'Base',
    kind: 'BASE',
    dbKind: 'BASELINE',
    description: 'Baseline',
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
}

function ok<T>(data: T) {
    return Promise.resolve({ok: true, data, error: null})
}

function installGoalsApi(overrides = {}) {
    const api = {
        ensureDefaultProjectionScenarios: vi.fn(() => ok([baseScenario])),
        listProjectionScenarios: vi.fn(() => ok([baseScenario])),
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
                budget: {
                    estimatedMonthlyIncome: 0,
                    estimatedMonthlyExpense: 2500,
                    estimatedNetMonthly: -2500,
                    incomeTargetCount: 0,
                    expenseTargetCount: 2,
                    ignoredTransferCount: 0,
                    targetCount: 2,
                },
                recurring: {
                    estimatedMonthlyIncome: 3000,
                    estimatedMonthlyExpense: 0,
                    estimatedNetMonthly: 3000,
                    incomeTemplateCount: 1,
                    expenseTemplateCount: 0,
                    ignoredTransferCount: 0,
                    templateCount: 1,
                },
                historical: {
                    estimatedMonthlyIncome: 3000,
                    estimatedMonthlyExpense: 2500,
                    estimatedNetMonthly: 500,
                    incomeTransactionCount: 3,
                    expenseTransactionCount: 6,
                    ignoredTransferCount: 1,
                    transactionCount: 9,
                    lookbackMonths: 3,
                },
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

describe('GoalsSection', () => {
    beforeEach(() => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        installGoalsApi()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders financial goals with projection status and assumptions', async () => {
        const wrapper = mount(GoalsSection, {
            props: {summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        expect(wrapper.text()).toContain('Objectifs financiers')
        expect(wrapper.text()).toContain('Fonds urgence')
        expect(wrapper.text()).toContain('Projection mensuelle')
        expect(wrapper.text()).toContain('Atteignable dans l’horizon')
        expect(wrapper.text()).toContain('Budget / historique')
        expect(wrapper.text()).toContain('Simulation déterministe')
    })

    it('creates a financial goal from the form', async () => {
        const api = installGoalsApi()
        const wrapper = mount(GoalsSection, {
            props: {summaryCurrency: 'CAD'},
        })

        await flushPromises()

        const inputs = wrapper.findAll('input')
        await inputs[0].setValue('Apport maison')
        await inputs[2].setValue('25000')
        await inputs[3].setValue('5000')
        await wrapper.find('form').trigger('submit.prevent')
        await flushPromises()

        expect(api.createFinancialGoal).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Apport maison',
            targetAmount: 25000,
            startingAmount: 5000,
            currency: 'CAD',
        }))
    })

    it('deletes a selected goal after confirmation', async () => {
        const api = installGoalsApi()
        const wrapper = mount(GoalsSection, {
            props: {summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        const deleteButton = wrapper.findAll('button').find((button) => button.text() === 'Supprimer')
        expect(deleteButton).toBeTruthy()
        await deleteButton!.trigger('click')
        await flushPromises()

        expect(api.deleteFinancialGoal).toHaveBeenCalledWith(1)
    })
})
