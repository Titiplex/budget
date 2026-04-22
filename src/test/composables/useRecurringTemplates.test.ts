import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useRecurringTemplates} from '../../composables/useRecurringTemplates'

describe('useRecurringTemplates', () => {
    it('computes due recurring rows and summary', () => {
        const accounts = ref([
            {id: 1, name: 'Main', type: 'BANK', currency: 'CAD'},
        ] as any)

        const categories = ref([
            {id: 1, name: 'Rent', kind: 'EXPENSE', color: '#999'},
        ] as any)

        const recurring = useRecurringTemplates({
            accounts,
            categories,
            showNotice: vi.fn(),
            refreshTransactions: vi.fn().mockResolvedValue(undefined),
        })

        recurring.recurringTemplates.value = [
            {
                id: 1,
                label: 'Rent',
                sourceAmount: 1000,
                sourceCurrency: 'CAD',
                accountAmount: 1000,
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                kind: 'EXPENSE',
                note: null,
                frequency: 'MONTHLY',
                intervalCount: 1,
                startDate: '2026-01-01',
                nextOccurrenceDate: '2026-03-01',
                endDate: null,
                isActive: true,
                accountId: 1,
                categoryId: 1,
                account: accounts.value[0],
                category: categories.value[0],
            },
        ] as any

        expect(recurring.recurringRows.value[0].dueCount).toBeGreaterThan(0)
        expect(recurring.recurringSummary.value.dueTemplates).toBe(1)
    })
})