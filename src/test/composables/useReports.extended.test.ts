import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useReports} from '../../composables/useReports'
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
        account: makeAccount(),
        category: makeCategory(),
        ...overrides,
    }
}

function createHarness(transactions: Transaction[] = []) {
    const accounts = ref<Account[]>([
        makeAccount({id: 1, name: 'Main', type: 'BANK', currency: 'CAD'}),
        makeAccount({id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'}),
        makeAccount({id: 3, name: 'Brokerage', type: 'INVESTMENT', currency: 'USD'}),
    ])
    const categories = ref<Category[]>([
        makeCategory({id: 10, name: 'Groceries', kind: 'EXPENSE'}),
        makeCategory({id: 11, name: 'Salary', kind: 'INCOME', color: null}),
    ])
    const showNotice = vi.fn()
    const reports = useReports({accounts, categories, transactions: ref(transactions), showNotice})

    return {reports, accounts, categories, showNotice}
}

describe('useReports extended workflows', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))
        i18n.global.locale.value = 'en'
        ;(window as any).file = {
            saveText: vi.fn().mockResolvedValue({canceled: false}),
        }
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('applies all presets including empty ALL ranges', () => {
        const {reports} = createHarness([
            makeTransaction({id: 1, date: '2026-02-01'}),
            makeTransaction({id: 2, date: '2026-04-10'}),
        ])

        reports.applyPreset('THIS_MONTH')
        expect(reports.reportStartDate.value).toBe('2026-04-01')
        expect(reports.reportEndDate.value).toBe('2026-04-26')

        reports.applyPreset('LAST_30_DAYS')
        expect(reports.reportStartDate.value).toBe('2026-03-28')
        expect(reports.reportEndDate.value).toBe('2026-04-26')

        reports.applyPreset('THIS_YEAR')
        expect(reports.reportStartDate.value).toBe('2026-01-01')
        expect(reports.reportEndDate.value).toBe('2026-04-26')

        reports.applyPreset('ALL')
        expect(reports.reportStartDate.value).toBe('2026-02-01')
        expect(reports.reportEndDate.value).toBe('2026-04-10')

        const empty = createHarness([]).reports
        empty.applyPreset('ALL')
        expect(empty.reportStartDate.value).toBe('2026-04-26')
        expect(empty.reportEndDate.value).toBe('2026-04-26')
    })

    it('computes summaries, previous comparison, account rows, categories, currencies and weekdays', () => {
        const account1 = makeAccount({id: 1, name: 'Main', type: 'BANK', currency: 'CAD'})
        const account2 = makeAccount({id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'})
        const account3 = makeAccount({id: 3, name: 'Brokerage', type: 'INVESTMENT', currency: 'USD'})
        const groceries = makeCategory({id: 10, name: 'Groceries', kind: 'EXPENSE'})
        const salary = makeCategory({id: 11, name: 'Salary', kind: 'INCOME', color: null})
        const transactions = [
            makeTransaction({id: 1, label: 'Salary', amount: 3000, kind: 'INCOME', date: '2026-04-05', accountId: 1, categoryId: 11, account: account1, category: salary}),
            makeTransaction({id: 2, label: 'Groceries', amount: -200, kind: 'EXPENSE', date: '2026-04-06', accountId: 1, categoryId: 10, account: account1, category: groceries}),
            makeTransaction({id: 3, label: 'Uncategorized', amount: 80, kind: 'EXPENSE', date: '2026-04-07', accountId: 2, categoryId: null, account: account2, category: null}),
            makeTransaction({id: 4, label: 'EUR expense', amount: 150, sourceAmount: 100, sourceCurrency: 'EUR', kind: 'EXPENSE', date: '2026-04-08', accountId: 1, categoryId: 10, account: account1, category: groceries}),
            makeTransaction({id: 5, label: 'Move out', amount: 500, kind: 'TRANSFER', date: '2026-04-09', accountId: 1, categoryId: null, transferGroup: 'grp-1', account: account1, category: null}),
            makeTransaction({id: 6, label: 'Move in', amount: 500, kind: 'TRANSFER', date: '2026-04-09', accountId: 2, categoryId: null, transferGroup: 'grp-1', account: account2, category: null}),
            makeTransaction({id: 7, label: 'Previous salary', amount: 2500, kind: 'INCOME', date: '2026-03-05', accountId: 3, categoryId: 11, account: account3, category: salary}),
            makeTransaction({id: 8, label: 'Previous rent', amount: 1000, kind: 'EXPENSE', date: '2026-03-06', accountId: 3, categoryId: 10, account: account3, category: groceries}),
            makeTransaction({id: 9, label: 'No account type', amount: 5, kind: 'EXPENSE', date: '2026-04-10', accountId: 999, categoryId: 10, account: null, category: groceries}),
        ]
        const {reports} = createHarness(transactions)
        reports.reportStartDate.value = '2026-04-01'
        reports.reportEndDate.value = '2026-04-30'

        expect(reports.filteredTransactions.value).toHaveLength(7)
        expect(reports.previousFilteredTransactions.value).toHaveLength(2)
        expect(reports.comparisonPeriod.value).toEqual({previousStartDate: '2026-03-02', previousEndDate: '2026-03-31', daySpan: 30})
        expect(reports.reportSummary.value).toMatchObject({
            transactionCount: 7,
            income: 3000,
            expense: 435,
            net: 2565,
            internalTransferCount: 1,
            foreignTransactionCount: 1,
        })
        expect(reports.previousReportSummary.value).toMatchObject({income: 2500, expense: 1000, net: 1500})
        expect(reports.reportComparison.value.income.delta).toBe(500)
        expect(reports.reportComparison.value.expense.delta).toBe(-565)
        expect(reports.reportComparison.value.net.delta).toBe(1065)

        expect(reports.accountTypeRows.value.map((row) => row.type)).toEqual(['BANK', 'SAVINGS', 'INVESTMENT'])
        expect(reports.accountTypeRows.value[0]).toMatchObject({type: 'BANK', accountCount: 1, transactionCount: 4, income: 3000, expense: 350, net: 2650})
        expect(reports.accountRows.value[0]).toMatchObject({accountId: 1, transactionCount: 4, income: 3000, expense: 350, net: 2650})
        expect(reports.categoryRows.value[0]).toMatchObject({categoryId: 10, name: 'Groceries', transactionCount: 3, total: 355, kind: 'EXPENSE'})
        expect(reports.categoryRows.value[1]).toMatchObject({categoryId: null, name: 'No category', transactionCount: 1, total: 80})
        expect(reports.foreignCurrencyRows.value).toEqual([{currency: 'EUR', transactionCount: 1, sourceTotal: 100, bookedTotal: 150}])
        expect(reports.weekdayRows.value.reduce((sum, row) => sum + row.total, 0)).toBe(435)
        expect(reports.insights.value.map((insight) => insight.title)).toEqual(expect.arrayContaining([
            'Top category',
            'Expense trend',
            'Net variation',
            'Internal transfers',
            'FX exposure',
        ]))
    })

    it('marks category kind as MIXED when income and expense share a category', () => {
        const shared = makeCategory({id: 10, name: 'Mixed bucket', kind: 'EXPENSE'})
        const account = makeAccount({id: 1})
        const {reports} = createHarness([
            makeTransaction({id: 1, amount: 100, kind: 'INCOME', date: '2026-04-10', account, category: shared, categoryId: 10}),
            makeTransaction({id: 2, amount: 40, kind: 'EXPENSE', date: '2026-04-11', account, category: shared, categoryId: 10}),
        ])

        reports.applyPreset('ALL')

        expect(reports.categoryRows.value[0]).toMatchObject({kind: 'MIXED', total: 140, transactionCount: 2})
    })

    it('exports report markdown and skips notice on canceled export', async () => {
        const {reports, showNotice} = createHarness([
            makeTransaction({id: 1, amount: 100, kind: 'INCOME', date: '2026-04-10'}),
        ])
        reports.applyPreset('ALL')

        await reports.exportPeriodReport()

        expect((window as any).file.saveText).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Export period report',
            defaultPath: 'budget-report-2026-04-10-to-2026-04-10.md',
            content: expect.stringContaining('# Reports'),
            filters: [{name: 'Markdown', extensions: ['md']}],
        }))
        expect(showNotice).toHaveBeenCalledWith('success', 'Report exported.')
        expect(reports.reportMarkdown.value).toContain('Transactions')

        ;(window as any).file.saveText.mockResolvedValueOnce({canceled: true})
        showNotice.mockClear()
        await reports.exportPeriodReport()

        expect(showNotice).not.toHaveBeenCalled()
    })

    it('keeps insights empty when there is no activity or trend', () => {
        const {reports} = createHarness([])
        reports.reportStartDate.value = '2026-04-01'
        reports.reportEndDate.value = '2026-04-30'

        expect(reports.categoryRows.value).toEqual([])
        expect(reports.foreignCurrencyRows.value).toEqual([])
        expect(reports.insights.value).toEqual([])
        expect(reports.reportSummary.value).toMatchObject({transactionCount: 0, income: 0, expense: 0, net: 0})
    })
})
