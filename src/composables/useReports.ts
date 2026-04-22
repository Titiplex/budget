import {computed, ref, type Ref} from 'vue'
import type {
    Account,
    AccountType,
    Category,
    ReportAccountRow,
    ReportAccountTypeRow,
    ReportCategoryRow,
    ReportCurrencyRow,
    ReportInsight,
    ReportPreset,
    ReportSummary,
    ReportWeekdayRow,
    Transaction,
} from '../types/budget'
import {tr} from '../i18n'
import {accountTypeLabel, formatDate, formatMoney} from '../utils/budgetFormat'
import {buildPreviousPeriod, buildReportComparison, summarizeTransactions, withinRange} from '../utils/reportComparison'
import {addUtcDays, toDateOnly, toUtcDate} from '../utils/date'

interface UseReportsOptions {
    accounts: Ref<Account[]>
    categories: Ref<Category[]>
    transactions: Ref<Transaction[]>
    showNotice: (type: 'success' | 'error', text: string) => void
}

function startOfMonth(now = new Date()) {
    const current = toUtcDate(now)
    return toDateOnly(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)))
}

function startOfYear(now = new Date()) {
    const current = toUtcDate(now)
    return toDateOnly(new Date(Date.UTC(current.getUTCFullYear(), 0, 1)))
}

function minusDays(now: Date, days: number) {
    return toDateOnly(addUtcDays(toUtcDate(now), -days))
}

export function useReports(options: UseReportsOptions) {
    const today = new Date()
    const reportPreset = ref<ReportPreset>('THIS_MONTH')
    const reportStartDate = ref(startOfMonth(today))
    const reportEndDate = ref(toDateOnly(today))

    function applyPreset(preset: ReportPreset) {
        reportPreset.value = preset

        if (preset === 'THIS_MONTH') {
            reportStartDate.value = startOfMonth()
            reportEndDate.value = toDateOnly(new Date())
            return
        }

        if (preset === 'LAST_30_DAYS') {
            reportStartDate.value = minusDays(new Date(), 29)
            reportEndDate.value = toDateOnly(new Date())
            return
        }

        if (preset === 'THIS_YEAR') {
            reportStartDate.value = startOfYear()
            reportEndDate.value = toDateOnly(new Date())
            return
        }

        if (preset === 'ALL') {
            const ordered = [...options.transactions.value]
                .sort((a, b) => toUtcDate(a.date).getTime() - toUtcDate(b.date).getTime())

            reportStartDate.value = ordered[0] ? toDateOnly(ordered[0].date) : toDateOnly(new Date())
            reportEndDate.value = ordered[ordered.length - 1]
                ? toDateOnly(ordered[ordered.length - 1].date)
                : toDateOnly(new Date())
        }
    }

    const filteredTransactions = computed(() =>
        options.transactions.value.filter((tx) =>
            withinRange(tx.date, reportStartDate.value, reportEndDate.value),
        ),
    )

    const comparisonPeriod = computed(() =>
        buildPreviousPeriod(reportStartDate.value, reportEndDate.value),
    )

    const previousFilteredTransactions = computed(() =>
        options.transactions.value.filter((tx) =>
            withinRange(tx.date, comparisonPeriod.value.previousStartDate, comparisonPeriod.value.previousEndDate),
        ),
    )

    const reportSummary = computed<ReportSummary>(() =>
        summarizeTransactions(filteredTransactions.value, reportStartDate.value, reportEndDate.value),
    )

    const previousReportSummary = computed<ReportSummary>(() =>
        summarizeTransactions(
            previousFilteredTransactions.value,
            comparisonPeriod.value.previousStartDate,
            comparisonPeriod.value.previousEndDate,
        ),
    )

    const reportComparison = computed(() =>
        buildReportComparison(reportSummary.value, previousReportSummary.value),
    )

    const accountTypeRows = computed<ReportAccountTypeRow[]>(() => {
        const rows = new Map<AccountType, ReportAccountTypeRow>()

        for (const account of options.accounts.value) {
            rows.set(account.type, {
                type: account.type,
                accountCount: (rows.get(account.type)?.accountCount || 0) + 1,
                transactionCount: 0,
                income: rows.get(account.type)?.income || 0,
                expense: rows.get(account.type)?.expense || 0,
                net: rows.get(account.type)?.net || 0,
            })
        }

        for (const tx of filteredTransactions.value) {
            const type = tx.account?.type
            if (!type) continue
            const row = rows.get(type)
            if (!row) continue

            row.transactionCount += 1
            if (tx.kind === 'INCOME') row.income += Math.abs(tx.amount)
            if (tx.kind === 'EXPENSE') row.expense += Math.abs(tx.amount)
            row.net = row.income - row.expense
        }

        return [...rows.values()].sort((a, b) => b.transactionCount - a.transactionCount || b.net - a.net)
    })

    const accountRows = computed<ReportAccountRow[]>(() => {
        return options.accounts.value
            .map((account) => {
                const rows = filteredTransactions.value.filter((tx) => tx.accountId === account.id)
                const income = rows
                    .filter((tx) => tx.kind === 'INCOME')
                    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
                const expense = rows
                    .filter((tx) => tx.kind === 'EXPENSE')
                    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

                return {
                    accountId: account.id,
                    name: account.name,
                    type: account.type,
                    currency: account.currency,
                    transactionCount: rows.length,
                    income,
                    expense,
                    net: income - expense,
                }
            })
            .sort((a, b) => b.transactionCount - a.transactionCount || b.net - a.net)
    })

    const categoryRows = computed<ReportCategoryRow[]>(() => {
        const map = new Map<number | null, ReportCategoryRow>()

        for (const tx of filteredTransactions.value) {
            if (tx.kind === 'TRANSFER') continue

            const key = tx.categoryId ?? null
            const existing = map.get(key)

            if (existing) {
                existing.transactionCount += 1
                existing.total += Math.abs(tx.amount)
                if (existing.kind !== tx.kind) {
                    existing.kind = 'MIXED'
                }
            } else {
                map.set(key, {
                    categoryId: key,
                    name: tx.category?.name || tr('reports.noCategory'),
                    transactionCount: 1,
                    total: Math.abs(tx.amount),
                    kind: tx.category?.kind || tx.kind,
                })
            }
        }

        return [...map.values()].sort((a, b) => b.total - a.total)
    })

    const foreignCurrencyRows = computed<ReportCurrencyRow[]>(() => {
        const map = new Map<string, ReportCurrencyRow>()

        for (const tx of filteredTransactions.value) {
            const sourceCurrency = (tx.sourceCurrency || tx.account?.currency || '').toUpperCase()
            const accountCurrency = (tx.account?.currency || '').toUpperCase()

            if (!sourceCurrency || !accountCurrency || sourceCurrency === accountCurrency) {
                continue
            }

            const sourceAmount = Math.abs(tx.sourceAmount ?? tx.amount)
            const bookedAmount = Math.abs(tx.amount)
            const existing = map.get(sourceCurrency)

            if (existing) {
                existing.transactionCount += 1
                existing.sourceTotal += sourceAmount
                existing.bookedTotal += bookedAmount
            } else {
                map.set(sourceCurrency, {
                    currency: sourceCurrency,
                    transactionCount: 1,
                    sourceTotal: sourceAmount,
                    bookedTotal: bookedAmount,
                })
            }
        }

        return [...map.values()].sort((a, b) => b.bookedTotal - a.bookedTotal)
    })

    const weekdayRows = computed<ReportWeekdayRow[]>(() => {
        const labels = [
            tr('reports.weekdays.sunday'),
            tr('reports.weekdays.monday'),
            tr('reports.weekdays.tuesday'),
            tr('reports.weekdays.wednesday'),
            tr('reports.weekdays.thursday'),
            tr('reports.weekdays.friday'),
            tr('reports.weekdays.saturday'),
        ]
        const rows = labels.map((label) => ({label, total: 0}))

        for (const tx of filteredTransactions.value) {
            if (tx.kind !== 'EXPENSE') continue
            const index = toUtcDate(tx.date).getUTCDay()
            rows[index].total += Math.abs(tx.amount)
        }

        return rows
    })

    const insights = computed<ReportInsight[]>(() => {
        const result: ReportInsight[] = []

        const topCategory = categoryRows.value[0]
        if (topCategory) {
            result.push({
                title: tr('reports.insight.dominantCategoryTitle'),
                text: tr('reports.insight.dominantCategoryText', {
                    category: topCategory.name,
                    amount: formatMoney(topCategory.total),
                }),
            })
        }

        const expenseDelta = reportComparison.value.expense
        if (expenseDelta.delta !== 0) {
            result.push({
                title: tr('reports.insight.expenseTrendTitle'),
                text: expenseDelta.delta > 0
                    ? tr('reports.insight.expenseTrendUp', {amount: formatMoney(Math.abs(expenseDelta.delta))})
                    : tr('reports.insight.expenseTrendDown', {amount: formatMoney(Math.abs(expenseDelta.delta))}),
            })
        }

        const netDelta = reportComparison.value.net
        if (netDelta.delta !== 0) {
            result.push({
                title: tr('reports.insight.netTrendTitle'),
                text: netDelta.delta > 0
                    ? tr('reports.insight.netTrendUp', {amount: formatMoney(Math.abs(netDelta.delta))})
                    : tr('reports.insight.netTrendDown', {amount: formatMoney(Math.abs(netDelta.delta))}),
            })
        }

        if (reportSummary.value.internalTransferCount > 0) {
            result.push({
                title: tr('reports.insight.internalTransfersTitle'),
                text: tr('reports.insight.internalTransfersText', {
                    count: reportSummary.value.internalTransferCount,
                }),
            })
        }

        if (reportSummary.value.foreignTransactionCount > 0) {
            result.push({
                title: tr('reports.insight.foreignExposureTitle'),
                text: tr('reports.insight.foreignExposureText', {
                    count: reportSummary.value.foreignTransactionCount,
                }),
            })
        }

        return result
    })

    const reportMarkdown = computed(() => {
        const comparison = reportComparison.value
        const lines = [
            `# ${tr('reports.sectionName')}`,
            ``,
            `${tr('reports.current')}: ${formatDate(reportSummary.value.startDate)} → ${formatDate(reportSummary.value.endDate)}`,
            `${tr('reports.previous')}: ${formatDate(comparison.previousStartDate)} → ${formatDate(comparison.previousEndDate)}`,
            ``,
            `## ${tr('reports.summary.transactions')}`,
            `- ${tr('reports.summary.transactions')} : ${reportSummary.value.transactionCount}`,
            `- ${tr('reports.summary.income')} : ${formatMoney(reportSummary.value.income)}`,
            `- ${tr('reports.summary.expense')} : ${formatMoney(reportSummary.value.expense)}`,
            `- ${tr('reports.summary.net')} : ${formatMoney(reportSummary.value.net)}`,
            `- ${tr('reports.summary.savingsRate')} : ${reportSummary.value.savingsRate.toFixed(1)}%`,
            `- ${tr('reports.summary.internalTransfers')} : ${reportSummary.value.internalTransferCount}`,
            ``,
        ]

        return `${lines.join('\n')}\n`
    })

    async function exportPeriodReport() {
        const fileName = `budget-report-${reportStartDate.value}-to-${reportEndDate.value}.md`
        const result = await window.file.saveText({
            title: tr('reports.exportDialogTitle'),
            defaultPath: fileName,
            content: reportMarkdown.value,
            filters: [{name: 'Markdown', extensions: ['md']}],
        })

        if (!result?.canceled) {
            options.showNotice('success', tr('reports.exportSuccess'))
        }
    }

    return {
        reportPreset,
        reportStartDate,
        reportEndDate,
        applyPreset,
        filteredTransactions,
        previousFilteredTransactions,
        comparisonPeriod,
        reportSummary,
        previousReportSummary,
        reportComparison,
        accountTypeRows,
        accountRows,
        categoryRows,
        foreignCurrencyRows,
        weekdayRows,
        insights,
        reportMarkdown,
        exportPeriodReport,
    }
}