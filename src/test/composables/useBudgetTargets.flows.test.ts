import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useBudgetTargets} from '../../composables/useBudgetTargets'
import type {BudgetTarget, Category, Transaction} from '../../types/budget'
import {i18n} from '../../i18n'

function makeCategory(overrides: Partial<Category> = {}): Category {
    return {
        id: 10,
        name: 'Groceries',
        kind: 'EXPENSE',
        color: '#22c55e',
        description: null,
        ...overrides,
    }
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 1,
        label: 'Transaction',
        amount: 50,
        sourceAmount: 50,
        sourceCurrency: 'CAD',
        conversionMode: 'NONE',
        exchangeRate: 1,
        exchangeProvider: 'ACCOUNT',
        exchangeDate: '2026-04-10',
        kind: 'EXPENSE',
        date: '2026-04-10',
        note: null,
        accountId: 1,
        categoryId: 10,
        account: null,
        category: makeCategory(),
        ...overrides,
    }
}

function makeBudget(overrides: Partial<BudgetTarget> = {}): BudgetTarget {
    return {
        id: 100,
        name: 'Groceries April',
        amount: 100,
        period: 'MONTHLY',
        startDate: '2026-04-15',
        endDate: null,
        currency: 'CAD',
        isActive: true,
        note: null,
        categoryId: 10,
        category: makeCategory(),
        ...overrides,
    }
}

function installBridgeMocks() {
    ;(window as any).db = {
        budgetTarget: {
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({id: 501}),
            update: vi.fn().mockResolvedValue({id: 502}),
            delete: vi.fn().mockResolvedValue(undefined),
        },
    }
}

function createHarness(
    categories = [makeCategory(), makeCategory({id: 11, name: 'Rent', color: null})],
    transactions: Transaction[] = [],
) {
    const showNotice = vi.fn()
    const budgets = useBudgetTargets({
        categories: ref(categories),
        transactions: ref(transactions),
        showNotice,
    })

    return {budgets, showNotice}
}

describe('useBudgetTargets workflows', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))
        i18n.global.locale.value = 'en'
        installBridgeMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('refreshes budgets and reports load failures', async () => {
        const {budgets, showNotice} = createHarness()
        ;(window as any).db.budgetTarget.list.mockResolvedValueOnce([makeBudget({id: 1})])

        await budgets.refreshBudgets()

        expect(budgets.budgetLoading.value).toBe(false)
        expect(budgets.budgets.value).toHaveLength(1)
        expect(budgets.budgets.value[0].id).toBe(1)

        ;(window as any).db.budgetTarget.list.mockRejectedValueOnce(new Error('load failed'))
        await budgets.refreshBudgets()

        expect(budgets.budgetLoading.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('error', 'load failed')
    })

    it('opens create/edit dialogs and resets them on close', () => {
        const {budgets} = createHarness()

        budgets.openCreateBudget(10)

        expect(budgets.budgetDialogOpen.value).toBe(true)
        expect(budgets.editingBudgetId.value).toBeNull()
        expect(budgets.budgetForm.categoryId).toBe('10')
        expect(budgets.budgetForm.name).toContain('Groceries')
        expect(budgets.budgetForm.startDate).toBe('2026-04-26')

        budgets.openEditBudget(makeBudget({
            id: 77,
            name: 'Rent cap',
            amount: 1200,
            period: 'CUSTOM',
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2026-04-30T00:00:00.000Z',
            currency: 'eur',
            isActive: false,
            note: 'Roommates',
            categoryId: 11,
        }))

        expect(budgets.editingBudgetId.value).toBe(77)
        expect(budgets.budgetForm.name).toBe('Rent cap')
        expect(budgets.budgetForm.amount).toBe('1200')
        expect(budgets.budgetForm.period).toBe('CUSTOM')
        expect(budgets.budgetForm.startDate).toBe('2026-04-01')
        expect(budgets.budgetForm.endDate).toBe('2026-04-30')
        expect(budgets.budgetForm.currency).toBe('eur')
        expect(budgets.budgetForm.isActive).toBe(false)
        expect(budgets.budgetForm.note).toBe('Roommates')
        expect(budgets.budgetForm.categoryId).toBe('11')

        budgets.closeBudgetDialog()

        expect(budgets.budgetDialogOpen.value).toBe(false)
        expect(budgets.editingBudgetId.value).toBeNull()
        expect(budgets.budgetForm.name).toBe('')
        expect(budgets.budgetForm.currency).toBe('CAD')
        expect(budgets.budgetForm.startDate).toBe('2026-04-26')
    })

    it('validates required budget form fields before saving', async () => {
        const {budgets, showNotice} = createHarness()

        await budgets.submitBudget()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budgets.budgetForm.name = 'Food'
        budgets.budgetForm.amount = '0'
        await budgets.submitBudget()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budgets.budgetForm.amount = '100'
        budgets.budgetForm.categoryId = ''
        await budgets.submitBudget()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        expect((window as any).db.budgetTarget.create).not.toHaveBeenCalled()
        expect(budgets.budgetSaving.value).toBe(false)
    })

    it('creates custom budgets with normalized payloads', async () => {
        const {budgets, showNotice} = createHarness()
        budgets.openCreateBudget()
        budgets.budgetForm.name = '  Food cap  '
        budgets.budgetForm.amount = '250.75'
        budgets.budgetForm.period = 'CUSTOM'
        budgets.budgetForm.startDate = '2026-04-10'
        budgets.budgetForm.endDate = '2026-04-20'
        budgets.budgetForm.currency = ' usd '
        budgets.budgetForm.note = '  Tight month  '
        budgets.budgetForm.categoryId = '10'

        await budgets.submitBudget()

        expect((window as any).db.budgetTarget.create).toHaveBeenCalledWith({
            name: 'Food cap',
            amount: 250.75,
            period: 'CUSTOM',
            startDate: '2026-04-10',
            endDate: '2026-04-20',
            currency: 'USD',
            isActive: true,
            note: 'Tight month',
            categoryId: 10,
        })
        expect((window as any).db.budgetTarget.list).toHaveBeenCalled()
        expect(budgets.budgetDialogOpen.value).toBe(false)
        expect(budgets.budgetSaving.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('updates non-custom budgets and clears non-custom end dates', async () => {
        const {budgets, showNotice} = createHarness()
        budgets.openEditBudget(makeBudget({id: 88, period: 'YEARLY', endDate: '2026-12-31'}))
        budgets.budgetForm.name = '  Yearly food  '
        budgets.budgetForm.amount = '5000'
        budgets.budgetForm.endDate = '2026-08-31'
        budgets.budgetForm.currency = ''
        budgets.budgetForm.note = '   '

        await budgets.submitBudget()

        expect((window as any).db.budgetTarget.update).toHaveBeenCalledWith(88, expect.objectContaining({
            name: 'Yearly food',
            amount: 5000,
            period: 'YEARLY',
            endDate: null,
            currency: 'CAD',
            note: null,
            categoryId: 10,
        }))
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('reports save, delete and delete failure states', async () => {
        const {budgets, showNotice} = createHarness()
        budgets.openCreateBudget(10)
        budgets.budgetForm.name = 'Food'
        budgets.budgetForm.amount = '100'
        ;(window as any).db.budgetTarget.create.mockRejectedValueOnce(new Error('save failed'))

        await budgets.submitBudget()

        expect(showNotice).toHaveBeenCalledWith('error', 'save failed')
        expect(budgets.budgetSaving.value).toBe(false)

        await budgets.deleteBudget(123)
        expect((window as any).db.budgetTarget.delete).toHaveBeenCalledWith(123)
        expect((window as any).db.budgetTarget.list).toHaveBeenCalled()
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))

        ;(window as any).db.budgetTarget.delete.mockRejectedValueOnce(new Error('delete failed'))
        await budgets.deleteBudget(456)

        expect(showNotice).toHaveBeenCalledWith('error', 'delete failed')
    })

    it('computes monthly, yearly and custom progress rows, statuses and global summary', () => {
        const transactions = [
            makeTransaction({id: 1, amount: 70, date: '2026-04-01', categoryId: 10}),
            makeTransaction({id: 2, amount: -35.255, date: '2026-04-30', categoryId: 10}),
            makeTransaction({id: 3, amount: 25, date: '2026-05-01', categoryId: 10}),
            makeTransaction({id: 4, amount: 1500, date: '2026-08-15', categoryId: 11}),
            makeTransaction({id: 5, amount: 99, kind: 'INCOME', date: '2026-04-10', categoryId: 10}),
            makeTransaction({id: 6, amount: 99, kind: 'TRANSFER', date: '2026-04-11', categoryId: 10}),
            makeTransaction({id: 7, amount: 20, date: '2026-04-15', categoryId: null}),
        ]
        const {budgets} = createHarness(undefined, transactions)
        budgets.budgets.value = [
            makeBudget({id: 1, name: 'Monthly over', amount: 100, period: 'MONTHLY', startDate: '2026-04-15', categoryId: 10}),
            makeBudget({id: 2, name: 'Yearly near', amount: 1800, period: 'YEARLY', startDate: '2026-07-15', categoryId: 11, category: makeCategory({id: 11, name: 'Rent', color: null})}),
            makeBudget({id: 3, name: 'Custom under', amount: 100, period: 'CUSTOM', startDate: '2026-04-14', endDate: '2026-04-16', categoryId: 999, category: null}),
            makeBudget({id: 4, name: 'Inactive over', amount: 10, period: 'MONTHLY', startDate: '2026-04-01', categoryId: 10, isActive: false}),
        ]

        const rows = budgets.budgetProgressRows.value
        const monthly = rows.find((row) => row.name === 'Monthly over')
        const yearly = rows.find((row) => row.name === 'Yearly near')
        const custom = rows.find((row) => row.name === 'Custom under')

        expect(rows.map((row) => row.name)).toEqual(['Monthly over', 'Yearly near', 'Custom under', 'Inactive over'])
        expect(monthly).toMatchObject({
            startDate: '2026-04-01',
            endDate: '2026-04-30',
            spentAmount: 105.26,
            remainingAmount: -5.26,
            progressPercent: 105.26,
            status: 'OVER',
            transactionCount: 2,
        })
        expect(yearly).toMatchObject({
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            spentAmount: 1500,
            remainingAmount: 300,
            progressPercent: 83.33,
            status: 'NEAR',
            categoryColor: null,
        })
        expect(custom).toMatchObject({
            startDate: '2026-04-14',
            endDate: '2026-04-16',
            categoryName: 'Unknown category',
            spentAmount: 0,
            status: 'UNDER',
        })
        expect(budgets.budgetGlobalSummary.value).toEqual({
            count: 3,
            targetAmount: 2000,
            spentAmount: 1605.26,
            remainingAmount: 394.74,
            overCount: 1,
            nearCount: 1,
        })
    })
})
