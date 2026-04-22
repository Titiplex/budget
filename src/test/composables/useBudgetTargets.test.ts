import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useBudgetTargets} from '../../composables/useBudgetTargets'

describe('useBudgetTargets', () => {
    it('computes a monthly budget status correctly across the full month', () => {
        const categories = ref([
            {id: 1, name: 'Groceries', kind: 'EXPENSE', color: '#0f0'},
        ] as any)

        const transactions = ref([
            {
                id: 1,
                label: 'A',
                amount: 30,
                kind: 'EXPENSE',
                date: '2026-04-01',
                categoryId: 1,
            },
            {
                id: 2,
                label: 'B',
                amount: 55,
                kind: 'EXPENSE',
                date: '2026-04-30',
                categoryId: 1,
            },
            {
                id: 3,
                label: 'Outside month',
                amount: 99,
                kind: 'EXPENSE',
                date: '2026-05-01',
                categoryId: 1,
            },
        ] as any)

        const budgets = useBudgetTargets({
            categories,
            transactions,
            showNotice: vi.fn(),
        })

        budgets.budgets.value = [
            {
                id: 10,
                name: 'Groceries April',
                amount: 100,
                period: 'MONTHLY',
                startDate: '2026-04-15',
                endDate: null,
                currency: 'CAD',
                isActive: true,
                note: null,
                categoryId: 1,
                category: categories.value[0],
            },
        ] as any

        expect(budgets.budgetProgressRows.value).toHaveLength(1)
        expect(budgets.budgetProgressRows.value[0].spentAmount).toBe(85)
        expect(budgets.budgetProgressRows.value[0].status).toBe('NEAR')
    })
})