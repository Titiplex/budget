import {mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import WealthGoalsSummaryCard from '../../components/WealthGoalsSummaryCard.vue'

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

const goals = [
    {
        id: 1,
        name: 'Valeur nette cible',
        type: 'NET_WORTH',
        targetAmount: 10000,
        currency: 'CAD',
        targetDate: '2027-12-31T00:00:00.000Z',
        startingAmount: 0,
        status: 'ACTIVE',
        priority: 1,
        notes: null,
    },
    {
        id: 2,
        name: 'Ancien objectif',
        type: 'SAVINGS',
        targetAmount: 2000,
        currency: 'CAD',
        targetDate: '2020-01-01T00:00:00.000Z',
        startingAmount: 500,
        status: 'ACTIVE',
        priority: 2,
        notes: null,
    },
]

const scenarios = [
    {
        id: 11,
        name: 'Base',
        kind: 'BASE',
        monthlySurplus: 500,
        annualGrowthRate: 0,
        annualInflationRate: 0,
        horizonMonths: 24,
        currency: 'CAD',
        isActive: true,
    },
]

function ok<T>(data: T) {
    return Promise.resolve({ok: true, data, error: null})
}

function installGoalsApi(overrides = {}) {
    const api = {
        ensureDefaultProjectionScenarios: vi.fn(() => ok(scenarios)),
        listProjectionScenarios: vi.fn(() => ok(scenarios)),
        listFinancialGoals: vi.fn(() => ok(goals)),
        estimateMonthlySurplus: vi.fn(() => ok({
            source: 'automaticFromBudget',
            currency: 'CAD',
            monthlyContributionUsed: 500,
            estimatedMonthlySurplus: 500,
            estimatedMonthlyIncome: 3000,
            estimatedMonthlyExpense: 2500,
            netMonthlyEstimate: 500,
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

describe('WealthGoalsSummaryCard', () => {
    beforeEach(() => {
        installGoalsApi()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders projected goals summary linked to current net worth', async () => {
        const wrapper = mount(WealthGoalsSummaryCard, {
            props: {currentNetWorth: 4000, summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        expect(wrapper.text()).toContain('Objectifs projetés')
        expect(wrapper.text()).toContain('Où je vais')
        expect(wrapper.text()).toContain('Actifs')
        expect(wrapper.text()).toContain('En retard')
        expect(wrapper.text()).toContain('Valeur nette cible')
        expect(wrapper.text()).toContain('Valeur actuelle utilisée')
        expect(wrapper.text()).toContain('Valeur projetée')
        expect(wrapper.text()).toContain('Hypothèses principales')
        expect(wrapper.find('svg[aria-label="Trajectoire projetée objectif patrimoine"]').exists()).toBe(true)
    })

    it('dispatches the global event to open goal detail', async () => {
        const listener = vi.fn()
        window.addEventListener('budget:open-goals', listener)
        const wrapper = mount(WealthGoalsSummaryCard, {
            props: {currentNetWorth: 4000, summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        const detailButton = wrapper.findAll('button').find((button) => button.text() === 'Détail')
        expect(detailButton).toBeTruthy()
        await detailButton!.trigger('click')

        expect(listener).toHaveBeenCalled()
        window.removeEventListener('budget:open-goals', listener)
    })

    it('does not block rendering when goals projection APIs fail', async () => {
        installGoalsApi({
            listFinancialGoals: vi.fn(() => Promise.resolve({
                ok: false,
                data: null,
                error: {message: 'backend unavailable'},
            })),
        })

        const wrapper = mount(WealthGoalsSummaryCard, {
            props: {currentNetWorth: 4000, summaryCurrency: 'CAD'},
        })

        await flushPromises()
        await flushPromises()

        expect(wrapper.text()).toContain('Les objectifs n’ont pas pu être projetés')
        expect(wrapper.text()).toContain('Le dashboard patrimoine reste disponible')
        expect(wrapper.text()).toContain('backend unavailable')
    })
})
