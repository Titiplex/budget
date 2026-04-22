import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useBudgetData} from '../../composables/useBudgetData'

describe('useBudgetData', () => {
    beforeEach(() => {
        ;(window as any).db = {
            account: {list: vi.fn()},
            category: {list: vi.fn()},
            transaction: {list: vi.fn()},
            budgetTarget: {list: vi.fn()},
            recurringTemplate: {list: vi.fn()},
        }
        ;(window as any).fx = {quoteHistorical: vi.fn()}
        ;(window as any).file = {saveText: vi.fn()}
    })

    it('collapses a transfer group in recent and filtered transactions', () => {
        const budget = useBudgetData(vi.fn())

        budget.transactions.value = [
            {
                id: 10,
                label: 'Move to savings',
                amount: 100,
                sourceAmount: 100,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-02',
                kind: 'TRANSFER',
                date: '2026-04-02',
                note: null,
                accountId: 1,
                categoryId: null,
                transferGroup: 'grp-1',
                transferDirection: 'OUT',
                account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD'},
                transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'},
                category: null,
            },
            {
                id: 11,
                label: 'Move to savings',
                amount: 100,
                sourceAmount: 100,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-02',
                kind: 'TRANSFER',
                date: '2026-04-02',
                note: null,
                accountId: 2,
                categoryId: null,
                transferGroup: 'grp-1',
                transferDirection: 'IN',
                account: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'},
                transferPeerAccount: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD'},
                category: null,
            },
            {
                id: 12,
                label: 'Groceries',
                amount: 40,
                sourceAmount: 40,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-03',
                kind: 'EXPENSE',
                date: '2026-04-03',
                note: null,
                accountId: 1,
                categoryId: null,
                account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD'},
                category: null,
            },
        ] as any

        budget.transactionSearch.value = 'savings'

        expect(budget.recentTransactions.value).toHaveLength(2)
        expect(budget.filteredTransactions.value).toHaveLength(1)
        expect(budget.filteredTransactions.value[0].id).toBe(10)
    })
})