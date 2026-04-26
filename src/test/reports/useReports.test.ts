import {ref} from 'vue'
import {describe, expect, it} from 'vitest'
import {i18n} from '../../i18n'
import {useReports} from '../../composables/useReports'
import {createReportRegressionDataset} from '../fixtures/reportRegressionDataset'

describe('useReports regression dataset', () => {
    function buildReports() {
        const dataset = createReportRegressionDataset()
        const reports = useReports({
            accounts: ref(dataset.accounts),
            categories: ref(dataset.categories),
            transactions: ref(dataset.transactions),
            showNotice: () => undefined,
        })

        reports.reportStartDate.value = dataset.currentPeriod.startDate
        reports.reportEndDate.value = dataset.currentPeriod.endDate

        return {dataset, reports}
    }

    it('aggregates the selected period without counting transfers as income or expenses', () => {
        const {reports} = buildReports()

        expect(reports.filteredTransactions.value.map((tx) => tx.id)).toEqual([
            100, 101, 102, 103, 104, 105, 106, 107,
        ])
        expect(reports.reportSummary.value).toEqual({
            startDate: '2026-04-01',
            endDate: '2026-04-07',
            transactionCount: 8,
            income: 3450.75,
            expense: 1120.8,
            net: 2329.95,
            savingsRate: 67.52,
            averageExpense: 280.2,
            averageIncome: 1725.38,
            foreignTransactionCount: 1,
            internalTransferCount: 1,
        })
    })

    it('builds an equivalent previous period and metric comparisons', () => {
        const {reports} = buildReports()

        expect(reports.comparisonPeriod.value).toEqual({
            previousStartDate: '2026-03-25',
            previousEndDate: '2026-03-31',
            daySpan: 7,
        })
        expect(reports.previousFilteredTransactions.value.map((tx) => tx.id)).toEqual([
            200, 201, 202, 203, 204, 205,
        ])
        expect(reports.previousReportSummary.value).toEqual({
            startDate: '2026-03-25',
            endDate: '2026-03-31',
            transactionCount: 6,
            income: 3000,
            expense: 1080,
            net: 1920,
            savingsRate: 64,
            averageExpense: 540,
            averageIncome: 1500,
            foreignTransactionCount: 0,
            internalTransferCount: 1,
        })
        expect(reports.reportComparison.value.income).toEqual({
            current: 3450.75,
            previous: 3000,
            delta: 450.75,
            deltaPercent: 15.03,
            trend: 'up',
        })
        expect(reports.reportComparison.value.expense).toEqual({
            current: 1120.8,
            previous: 1080,
            delta: 40.8,
            deltaPercent: 3.78,
            trend: 'up',
        })
        expect(reports.reportComparison.value.net).toEqual({
            current: 2329.95,
            previous: 1920,
            delta: 409.95,
            deltaPercent: 21.35,
            trend: 'up',
        })
    })

    it('computes stable account, account-type, category, currency and weekday subtotals', () => {
        const {reports} = buildReports()

        expect(reports.accountTypeRows.value).toEqual([
            {
                type: 'BANK',
                accountCount: 1,
                transactionCount: 5,
                income: 3000,
                expense: 1090.55,
                net: 1909.45,
            },
            {
                type: 'CASH',
                accountCount: 1,
                transactionCount: 2,
                income: 0,
                expense: 30.25,
                net: -30.25,
            },
            {
                type: 'INVESTMENT',
                accountCount: 1,
                transactionCount: 1,
                income: 450.75,
                expense: 0,
                net: 450.75,
            },
        ])
        expect(reports.accountRows.value).toEqual([
            {
                accountId: 1,
                name: 'Chequing',
                type: 'BANK',
                currency: 'CAD',
                transactionCount: 5,
                income: 3000,
                expense: 1090.55,
                net: 1909.45,
            },
            {
                accountId: 2,
                name: 'Cash wallet',
                type: 'CASH',
                currency: 'CAD',
                transactionCount: 2,
                income: 0,
                expense: 30.25,
                net: -30.25,
            },
            {
                accountId: 3,
                name: 'Broker USD',
                type: 'INVESTMENT',
                currency: 'USD',
                transactionCount: 1,
                income: 450.75,
                expense: 0,
                net: 450.75,
            },
        ])
        expect(reports.categoryRows.value).toEqual([
            {categoryId: 10, name: 'Salary', transactionCount: 1, total: 3000, kind: 'INCOME'},
            {categoryId: 11, name: 'Rent', transactionCount: 1, total: 900, kind: 'EXPENSE'},
            {categoryId: 13, name: 'Freelance', transactionCount: 1, total: 450.75, kind: 'INCOME'},
            {categoryId: 12, name: 'Groceries', transactionCount: 2, total: 190.55, kind: 'EXPENSE'},
            {categoryId: 14, name: 'Dining', transactionCount: 1, total: 30.25, kind: 'EXPENSE'},
        ])
        expect(reports.foreignCurrencyRows.value).toEqual([
            {currency: 'EUR', transactionCount: 1, sourceTotal: 50, bookedTotal: 70},
        ])
        expect(reports.weekdayRows.value).toEqual([
            {label: 'Sunday', total: 30.25},
            {label: 'Monday', total: 0},
            {label: 'Tuesday', total: 0},
            {label: 'Wednesday', total: 900},
            {label: 'Thursday', total: 120.55},
            {label: 'Friday', total: 70},
            {label: 'Saturday', total: 0},
        ])
    })

    it('keeps exported markdown deterministic for the selected period', () => {
        const {reports} = buildReports()
        i18n.global.locale.value = 'en'

        expect(reports.reportMarkdown.value).toContain('# Reports')
        expect(reports.reportMarkdown.value).toContain('Current: Apr 1, 2026 → Apr 7, 2026')
        expect(reports.reportMarkdown.value).toContain('Previous: Mar 25, 2026 → Mar 31, 2026')
        expect(reports.reportMarkdown.value).toContain('- Income : $3,450.75')
        expect(reports.reportMarkdown.value).toContain('- Expenses : $1,120.80')
        expect(reports.reportMarkdown.value).toContain('- Net : $2,329.95')
        expect(reports.reportMarkdown.value).toContain('- Savings rate : 67.5%')
        expect(reports.reportMarkdown.value).toContain('- Internal transfers : 1')
    })
})
