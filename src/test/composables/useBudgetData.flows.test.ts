import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {useBudgetData} from '../../composables/useBudgetData'
import type {Account, Category, Transaction} from '../../types/budget'
import {i18n} from '../../i18n'

function makeAccount(overrides: Partial<Account> = {}): Account {
    return {
        id: 1,
        name: 'Main',
        type: 'BANK',
        currency: 'CAD',
        description: null,
        ...overrides,
    }
}

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
        id: 100,
        label: 'Groceries',
        amount: 42,
        sourceAmount: 42,
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
        account: makeAccount(),
        category: makeCategory(),
        transferGroup: null,
        transferDirection: null,
        transferPeerAccountId: null,
        transferPeerAccount: null,
        ...overrides,
    }
}

function installBridgeMocks() {
    ;(window as any).db = {
        account: {
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({id: 501}),
            update: vi.fn().mockResolvedValue({id: 502}),
            delete: vi.fn().mockResolvedValue(undefined),
        },
        category: {
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({id: 601}),
            update: vi.fn().mockResolvedValue({id: 602}),
            delete: vi.fn().mockResolvedValue(undefined),
        },
        transaction: {
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({id: 701}),
            update: vi.fn().mockResolvedValue({id: 702}),
            delete: vi.fn().mockResolvedValue(undefined),
        },
    }

    ;(window as any).fx = {
        quoteHistorical: vi.fn().mockResolvedValue({
            convertedAmount: 135,
            rate: 1.35,
            provider: 'TEST_FX',
            date: '2026-04-10',
        }),
    }
}

function createBudget() {
    const showNotice = vi.fn()
    const budget = useBudgetData(showNotice)
    return {budget, showNotice}
}

describe('useBudgetData workflows', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))
        i18n.global.locale.value = 'en'
        installBridgeMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('refreshes accounts, categories and transactions and reports refresh failures', async () => {
        const accounts = [makeAccount()]
        const categories = [makeCategory()]
        const transactions = [makeTransaction()]
        ;(window as any).db.account.list.mockResolvedValueOnce(accounts)
        ;(window as any).db.category.list.mockResolvedValueOnce(categories)
        ;(window as any).db.transaction.list.mockResolvedValueOnce(transactions)
        const {budget, showNotice} = createBudget()

        await budget.refreshData()

        expect(budget.loading.value).toBe(false)
        expect(budget.accounts.value).toEqual(accounts)
        expect(budget.categories.value).toEqual(categories)
        expect(budget.transactions.value).toEqual(transactions)

        ;(window as any).db.account.list.mockRejectedValueOnce(new Error('load failed'))
        await budget.refreshData()

        expect(budget.loading.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('error', 'load failed')
    })

    it('opens, fills and resets create and edit panels', async () => {
        const account = makeAccount({id: 7, name: 'Euro account', currency: 'EUR', description: 'Primary'})
        const category = makeCategory({id: 8, name: 'Salary', kind: 'INCOME', color: null, description: 'Work'})
        const transaction = makeTransaction({
            id: 9,
            label: 'Foreign income',
            amount: 135,
            sourceAmount: 100,
            sourceCurrency: 'USD',
            conversionMode: 'MANUAL',
            exchangeRate: 1.35,
            exchangeProvider: 'Manual',
            exchangeDate: '2026-04-09',
            kind: 'INCOME',
            date: '2026-04-10',
            note: 'Client',
            accountId: 7,
            categoryId: 8,
            account,
            category,
        })
        const {budget} = createBudget()
        budget.accounts.value = [account]
        budget.categories.value = [category]

        budget.sidebarOpen.value = true
        budget.selectSection('transactions')
        expect(budget.activeSection.value).toBe('transactions')
        expect(budget.sidebarOpen.value).toBe(false)

        budget.openCreatePanel('transaction')
        expect(budget.createPanelOpen.value).toBe(true)
        expect(budget.panelMode.value).toBe('create')
        expect(budget.createTab.value).toBe('transaction')
        expect(budget.transactionForm.accountId).toBe('7')
        expect(budget.transactionForm.currency).toBe('EUR')

        budget.openEditAccount(account)
        expect(budget.panelMode.value).toBe('edit')
        expect(budget.editingTarget.value).toEqual({type: 'account', id: 7})
        expect(budget.accountForm.name).toBe('Euro account')
        expect(budget.accountForm.description).toBe('Primary')

        budget.openEditCategory(category)
        expect(budget.editingTarget.value).toEqual({type: 'category', id: 8})
        expect(budget.categoryForm.name).toBe('Salary')
        expect(budget.categoryForm.color).toBe('#8b5cf6')

        budget.openEditTransaction(transaction)
        expect(budget.editingTarget.value).toEqual({type: 'transaction', id: 9})
        expect(budget.transactionForm.label).toBe('Foreign income')
        expect(budget.transactionForm.amount).toBe('100')
        expect(budget.transactionForm.accountAmount).toBe('135')
        expect(budget.transactionForm.currency).toBe('USD')
        expect(budget.transactionForm.exchangeRate).toBe('1.35')
        expect(budget.fxPreview.value).toMatchObject({convertedAmount: 135, rate: 1.35})

        budget.closeCreatePanel()
        await nextTick()

        expect(budget.createPanelOpen.value).toBe(false)
        expect(budget.panelMode.value).toBe('create')
        expect(budget.editingTarget.value).toBeNull()
        expect(budget.accountForm.name).toBe('')
        expect(budget.categoryForm.name).toBe('')
        expect(budget.transactionForm.label).toBe('')
        expect(budget.fxPreview.value).toBeNull()
    })

    it('opens edit forms for transfer groups using the outgoing and incoming legs', () => {
        const main = makeAccount({id: 1, name: 'Main', currency: 'CAD'})
        const savings = makeAccount({id: 2, name: 'Savings', type: 'SAVINGS', currency: 'USD'})
        const outgoing = makeTransaction({
            id: 1,
            label: 'Move money',
            amount: 100,
            sourceAmount: 100,
            sourceCurrency: 'CAD',
            conversionMode: 'NONE',
            exchangeRate: 1,
            exchangeProvider: 'ACCOUNT',
            exchangeDate: '2026-04-10',
            kind: 'TRANSFER',
            accountId: 1,
            categoryId: null,
            account: main,
            category: null,
            transferGroup: 'grp-1',
            transferDirection: 'OUT',
            transferPeerAccountId: 2,
            transferPeerAccount: savings,
        })
        const incoming = makeTransaction({
            id: 2,
            label: 'Move money',
            amount: 130,
            sourceAmount: 100,
            sourceCurrency: 'CAD',
            conversionMode: 'MANUAL',
            exchangeRate: 1.3,
            exchangeProvider: 'Manual',
            exchangeDate: '2026-04-11',
            kind: 'TRANSFER',
            accountId: 2,
            categoryId: null,
            account: savings,
            category: null,
            transferGroup: 'grp-1',
            transferDirection: 'IN',
            transferPeerAccountId: 1,
            transferPeerAccount: main,
        })
        const {budget} = createBudget()
        budget.accounts.value = [main, savings]
        budget.transactions.value = [incoming, outgoing]

        budget.openEditTransaction(incoming)

        expect(budget.transactionForm.kind).toBe('TRANSFER')
        expect(budget.transactionForm.label).toBe('Move money')
        expect(budget.transactionForm.amount).toBe('100')
        expect(budget.transactionForm.accountAmount).toBe('130')
        expect(budget.transactionForm.accountId).toBe('1')
        expect(budget.transactionForm.transferTargetAccountId).toBe('2')
        expect(budget.transactionForm.exchangeProvider).toBe('Manual')
        expect(budget.fxPreview.value).toMatchObject({convertedAmount: 130, rate: 1.3})
    })

    it('validates account and category forms and creates or updates them', async () => {
        const {budget, showNotice} = createBudget()

        await budget.submitAccount()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.accountForm.name = 'Main'
        budget.accountForm.currency = 'ca'
        await budget.submitAccount()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.accountForm.currency = ' cad '
        budget.accountForm.description = '  Primary  '
        await budget.submitAccount()
        expect((window as any).db.account.create).toHaveBeenCalledWith({
            name: 'Main',
            type: 'BANK',
            currency: 'CAD',
            description: 'Primary',
        })
        expect(budget.activeSection.value).toBe('accounts')
        expect(budget.saving.value).toBe(false)

        budget.openEditAccount(makeAccount({id: 1}))
        budget.accountForm.name = 'Updated account'
        await budget.submitAccount()
        expect((window as any).db.account.update).toHaveBeenCalledWith(1, expect.objectContaining({name: 'Updated account'}))

        await budget.submitCategory()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.categoryForm.name = '  Food  '
        budget.categoryForm.description = '  Meals  '
        budget.categoryForm.color = '   '
        await budget.submitCategory()
        expect((window as any).db.category.create).toHaveBeenCalledWith({
            name: 'Food',
            kind: 'EXPENSE',
            color: null,
            description: 'Meals',
        })
        expect(budget.activeSection.value).toBe('categories')

        budget.openEditCategory(makeCategory({id: 10}))
        budget.categoryForm.name = 'Updated category'
        budget.categoryForm.kind = 'INCOME'
        await budget.submitCategory()
        expect((window as any).db.category.update).toHaveBeenCalledWith(10, expect.objectContaining({
            name: 'Updated category',
            kind: 'INCOME',
        }))
    })

    it('validates transaction forms and creates same-currency transactions', async () => {
        const {budget, showNotice} = createBudget()

        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.accounts.value = [makeAccount({id: 1, currency: 'CAD'})]
        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.accountId = '1'
        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.label = 'Coffee'
        budget.transactionForm.amount = '0'
        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.amount = '4.50'
        budget.transactionForm.date = ''
        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.date = '2026-04-10'
        budget.transactionForm.note = '  Latte  '
        budget.transactionForm.categoryId = '10'
        await budget.submitTransaction()

        expect((window as any).db.transaction.create).toHaveBeenCalledWith({
            label: 'Coffee',
            amount: 4.5,
            sourceAmount: 4.5,
            sourceCurrency: 'CAD',
            conversionMode: 'NONE',
            exchangeRate: 1,
            exchangeProvider: 'ACCOUNT',
            exchangeDate: '2026-04-10',
            kind: 'EXPENSE',
            date: '2026-04-10',
            note: 'Latte',
            accountId: 1,
            categoryId: 10,
            transferTargetAccountId: null,
        })
        expect(budget.activeSection.value).toBe('transactions')
        expect(budget.saving.value).toBe(false)
    })

    it('updates manual foreign-currency transactions and handles automatic FX quotes', async () => {
        const {budget, showNotice} = createBudget()
        budget.accounts.value = [makeAccount({id: 1, currency: 'CAD'})]
        budget.openEditTransaction(makeTransaction({id: 88, accountId: 1, sourceCurrency: 'USD', account: makeAccount({id: 1, currency: 'CAD'})}))
        budget.transactionForm.label = 'Client payment'
        budget.transactionForm.amount = '100'
        budget.transactionForm.currency = 'USD'
        budget.transactionForm.accountAmount = '130'
        budget.transactionForm.conversionMode = 'MANUAL'
        budget.transactionForm.exchangeProvider = ''
        budget.transactionForm.date = '2026-04-10'
        budget.transactionForm.exchangeDate = ''
        budget.transactionForm.categoryId = '10'

        await budget.submitTransaction()

        expect((window as any).db.transaction.update).toHaveBeenCalledWith(88, expect.objectContaining({
            label: 'Client payment',
            amount: 130,
            sourceAmount: 100,
            sourceCurrency: 'USD',
            conversionMode: 'MANUAL',
            exchangeRate: 1.3,
            exchangeProvider: 'MANUAL',
            exchangeDate: '2026-04-10',
        }))

        budget.openCreatePanel('transaction')
        budget.accounts.value = [makeAccount({id: 1, currency: 'CAD'})]
        budget.transactionForm.accountId = '1'
        budget.transactionForm.label = 'Automatic expense'
        budget.transactionForm.amount = '100'
        budget.transactionForm.currency = 'USD'
        budget.transactionForm.date = '2026-04-10'
        budget.transactionForm.conversionMode = 'AUTOMATIC'
        await budget.submitTransaction()

        expect((window as any).fx.quoteHistorical).toHaveBeenCalledWith({from: 'USD', to: 'CAD', amount: 100, date: '2026-04-10'})
        expect((window as any).db.transaction.create).toHaveBeenLastCalledWith(expect.objectContaining({
            amount: 135,
            conversionMode: 'AUTOMATIC',
            exchangeRate: 1.35,
            exchangeProvider: 'TEST_FX',
        }))

        budget.openCreatePanel('transaction')
        budget.accounts.value = [makeAccount({id: 1, currency: 'CAD'})]
        budget.transactionForm.accountId = '1'
        budget.transactionForm.label = 'Bad manual FX'
        budget.transactionForm.amount = '100'
        budget.transactionForm.currency = 'USD'
        budget.transactionForm.accountAmount = '0'
        budget.transactionForm.conversionMode = 'MANUAL'
        await budget.submitTransaction()

        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))
        expect(budget.saving.value).toBe(false)
    })

    it('quotes transaction FX and validates quote prerequisites', async () => {
        const {budget, showNotice} = createBudget()

        await budget.quoteTransactionFx()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.accounts.value = [makeAccount({id: 1, currency: 'CAD'}), makeAccount({id: 2, currency: 'USD'})]
        budget.transactionForm.accountId = '1'
        budget.transactionForm.kind = 'TRANSFER'
        await nextTick()
        await budget.quoteTransactionFx()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.transferTargetAccountId = '2'
        budget.transactionForm.amount = '100'
        budget.transactionForm.date = '2026-04-10'
        await budget.quoteTransactionFx()

        expect((window as any).fx.quoteHistorical).toHaveBeenCalledWith({from: 'CAD', to: 'USD', amount: 100, date: '2026-04-10'})
        expect(budget.transactionForm.accountAmount).toBe('135')
        expect(budget.transactionForm.exchangeRate).toBe('1.35')
        expect(budget.transactionForm.conversionMode).toBe('AUTOMATIC')
        expect(budget.fxPreview.value).toMatchObject({convertedAmount: 135, rate: 1.35})
        expect(budget.fxBusy.value).toBe(false)

        ;(window as any).fx.quoteHistorical.mockRejectedValueOnce(new Error('fx failed'))
        await budget.quoteTransactionFx()
        expect(showNotice).toHaveBeenCalledWith('error', 'fx failed')
        expect(budget.fxBusy.value).toBe(false)
    })

    it('validates and creates transfer transactions', async () => {
        const {budget, showNotice} = createBudget()
        budget.accounts.value = [makeAccount({id: 1, currency: 'CAD'}), makeAccount({id: 2, type: 'SAVINGS', currency: 'CAD'})]
        budget.transactionForm.kind = 'TRANSFER'
        budget.transactionForm.accountId = '1'
        budget.transactionForm.label = 'Move money'
        budget.transactionForm.amount = '50'
        budget.transactionForm.date = '2026-04-10'
        await nextTick()

        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.transferTargetAccountId = '1'
        await budget.submitTransaction()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        budget.transactionForm.transferTargetAccountId = '2'
        await budget.submitTransaction()

        expect((window as any).db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Move money',
            kind: 'TRANSFER',
            categoryId: null,
            transferTargetAccountId: 2,
            accountId: 1,
        }))
    })

    it('opens delete dialogs and confirms account, category and transaction deletions', async () => {
        const {budget, showNotice} = createBudget()
        const account = makeAccount({id: 1})
        const category = makeCategory({id: 10})
        const transaction = makeTransaction({id: 100, kind: 'TRANSFER', transferGroup: 'grp-1'})
        budget.transactions.value = [transaction, makeTransaction({id: 101, accountId: 1, categoryId: 10})]

        budget.openDeleteDialog('account', account)
        expect(budget.deleteDialog.open).toBe(true)
        expect(budget.deleteDialog.type).toBe('account')
        expect(budget.deleteDialog.id).toBe(1)
        expect(budget.deleteDialog.message.length).toBeGreaterThan(0)
        await budget.confirmDelete()
        expect((window as any).db.account.delete).toHaveBeenCalledWith(1)
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))

        budget.openDeleteDialog('category', category)
        await budget.confirmDelete()
        expect((window as any).db.category.delete).toHaveBeenCalledWith(10)

        budget.openDeleteDialog('transaction', transaction)
        expect(budget.deleteDialog.heading.length).toBeGreaterThan(0)
        expect(budget.deleteDialog.message.length).toBeGreaterThan(0)
        await budget.confirmDelete()
        expect((window as any).db.transaction.delete).toHaveBeenCalledWith(100)
        expect(budget.deleteDialog.open).toBe(false)

        budget.openDeleteDialog('transaction', makeTransaction({id: 999, label: 'Fail'}))
        ;(window as any).db.transaction.delete.mockRejectedValueOnce(new Error('delete failed'))
        await budget.confirmDelete()
        expect(showNotice).toHaveBeenCalledWith('error', 'delete failed')
        expect(budget.deleteDialog.busy).toBe(false)
    })

    it('requests deletion for the current edit form including fallback transaction payloads', () => {
        const {budget} = createBudget()

        budget.requestDeleteCurrentForm()
        expect(budget.deleteDialog.open).toBe(false)

        budget.openEditAccount(makeAccount({id: 1, name: 'Main'}))
        budget.requestDeleteCurrentForm()
        expect(budget.deleteDialog.type).toBe('account')
        expect(budget.deleteDialog.label).toBe('Main')
        budget.closeDeleteDialog()

        budget.openEditCategory(makeCategory({id: 10, name: 'Groceries'}))
        budget.requestDeleteCurrentForm()
        expect(budget.deleteDialog.type).toBe('category')
        expect(budget.deleteDialog.label).toBe('Groceries')
        budget.closeDeleteDialog()

        budget.openEditTransaction(makeTransaction({id: 100, label: 'Existing'}))
        budget.transactions.value = [makeTransaction({id: 100, label: 'Existing'})]
        budget.requestDeleteCurrentForm()
        expect(budget.deleteDialog.type).toBe('transaction')
        expect(budget.deleteDialog.label).toBe('Existing')
        budget.closeDeleteDialog()

        budget.transactions.value = []
        budget.openEditTransaction(makeTransaction({id: 101, label: 'Fallback'}))
        budget.requestDeleteCurrentForm()
        expect(budget.deleteDialog.type).toBe('transaction')
        expect(budget.deleteDialog.label).toBe('Fallback')
    })

    it('computes dashboard summaries, filters and panel metadata', async () => {
        const main = makeAccount({id: 1, name: 'Main', currency: 'CAD'})
        const savings = makeAccount({id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'})
        const groceries = makeCategory({id: 10, name: 'Groceries', kind: 'EXPENSE', color: null})
        const salary = makeCategory({id: 11, name: 'Salary', kind: 'INCOME', color: '#0ea5e9'})
        const transactions = [
            makeTransaction({id: 1, label: 'Salary', amount: 3000, kind: 'INCOME', date: '2026-04-01', accountId: 1, categoryId: 11, account: main, category: salary}),
            makeTransaction({id: 2, label: 'Groceries', amount: -200, kind: 'EXPENSE', date: '2026-04-02', note: 'Market', accountId: 1, categoryId: 10, account: main, category: groceries}),
            makeTransaction({id: 3, label: 'No category', amount: 50, kind: 'EXPENSE', date: '2026-04-03', accountId: 2, categoryId: null, account: savings, category: null}),
            makeTransaction({id: 4, label: 'Move out', amount: 100, kind: 'TRANSFER', date: '2026-04-04', accountId: 1, categoryId: null, account: main, category: null, transferGroup: 'grp-1', transferDirection: 'OUT', transferPeerAccountId: 2, transferPeerAccount: savings}),
            makeTransaction({id: 5, label: 'Move in', amount: 100, kind: 'TRANSFER', date: '2026-04-04', accountId: 2, categoryId: null, account: savings, category: null, transferGroup: 'grp-1', transferDirection: 'IN', transferPeerAccountId: 1, transferPeerAccount: main}),
            makeTransaction({id: 6, label: 'Old invalid date', amount: 999, kind: 'EXPENSE', date: 'bad-date', accountId: 1, categoryId: 10, account: main, category: groceries}),
        ]
        const {budget} = createBudget()
        budget.accounts.value = [main, savings]
        budget.categories.value = [groceries, salary]
        budget.transactions.value = transactions

        expect(budget.summaryCurrency.value).toBe('CAD')
        expect(budget.totalIncome.value).toBe(3000)
        expect(budget.totalExpense.value).toBe(1249)
        expect(budget.netFlow.value).toBe(1751)
        expect(budget.recentTransactions.value.map((tx) => tx.id)).toContain(4)
        expect(budget.accountSummaries.value[0]).toMatchObject({id: 1, transactionCount: 4, income: 3000, expense: 1199, net: 1801})
        expect(budget.categorySummaries.value[0]).toMatchObject({id: 10, transactionCount: 2, total: 1199})
        expect(budget.topExpenseCategories.value[0]).toMatchObject({name: 'Groceries', total: 1199, color: null})
        expect(budget.expenseCategoryBreakdown.value[0].percent).toBeCloseTo(96, 0)
        expect(budget.monthlyTrend.value).toHaveLength(6)

        budget.transactionSearch.value = 'market'
        expect(budget.filteredTransactions.value).toHaveLength(1)
        expect(budget.filteredTransactions.value[0].label).toBe('Groceries')

        budget.transactionSearch.value = ''
        budget.transactionKindFilter.value = 'EXPENSE'
        budget.transactionAccountFilter.value = '2'
        budget.transactionCategoryFilter.value = 'NONE'
        expect(budget.filteredTransactions.value.map((tx) => tx.label)).toEqual(['No category'])

        budget.transactionKindFilter.value = 'INCOME'
        budget.transactionAccountFilter.value = 'ALL'
        budget.transactionCategoryFilter.value = '10'
        expect(budget.filteredTransactions.value).toHaveLength(0)

        budget.transactionForm.kind = 'TRANSFER'
        await nextTick()
        expect(budget.transactionFormCategories.value).toEqual([])
        expect(budget.panelDescription.value.length).toBeGreaterThan(0)

        budget.openCreatePanel('account')
        expect(budget.panelTitle.value.length).toBeGreaterThan(0)
        expect(budget.panelSubmitLabel.value.length).toBeGreaterThan(0)

        budget.openEditCategory(groceries)
        expect(budget.panelTitle.value.length).toBeGreaterThan(0)
        expect(budget.panelDescription.value.length).toBeGreaterThan(0)
        expect(budget.panelSubmitLabel.value.length).toBeGreaterThan(0)
    })
})
