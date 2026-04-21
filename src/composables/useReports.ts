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
import {accountTypeLabel, formatDate, formatMoney} from '../utils/budgetFormat'
import {buildPreviousPeriod, buildReportComparison, summarizeTransactions, withinRange} from '../utils/reportComparison'

interface UseReportsOptions {
    accounts: Ref<Account[]>
    categories: Ref<Category[]>
    transactions: Ref<Transaction[]>
    showNotice: (type: 'success' | 'error', text: string) => void
}

function isoDate(date: Date) {
    return new Date(date).toISOString().slice(0, 10)
}

function startOfMonth(now = new Date()) {
    return isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

function startOfYear(now = new Date()) {
    return isoDate(new Date(now.getFullYear(), 0, 1))
}

function minusDays(now: Date, days: number) {
    return isoDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
}

export function useReports(options: UseReportsOptions) {
    const today = new Date()
    const reportPreset = ref<ReportPreset>('THIS_MONTH')
    const reportStartDate = ref(startOfMonth(today))
    const reportEndDate = ref(isoDate(today))

    function applyPreset(preset: ReportPreset) {
        reportPreset.value = preset

        if (preset === 'THIS_MONTH') {
            reportStartDate.value = startOfMonth()
            reportEndDate.value = isoDate(new Date())
            return
        }

        if (preset === 'LAST_30_DAYS') {
            reportStartDate.value = minusDays(new Date(), 29)
            reportEndDate.value = isoDate(new Date())
            return
        }

        if (preset === 'THIS_YEAR') {
            reportStartDate.value = startOfYear()
            reportEndDate.value = isoDate(new Date())
            return
        }

        if (preset === 'ALL') {
            const ordered = [...options.transactions.value]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

            reportStartDate.value = ordered[0] ? isoDate(new Date(ordered[0].date)) : isoDate(new Date())
            reportEndDate.value = ordered[ordered.length - 1]
                ? isoDate(new Date(ordered[ordered.length - 1].date))
                : isoDate(new Date())
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
                    name: tx.category?.name || 'Sans catégorie',
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
        const labels = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
        const rows = labels.map((label) => ({label, total: 0}))

        for (const tx of filteredTransactions.value) {
            if (tx.kind !== 'EXPENSE') continue
            const index = new Date(tx.date).getDay()
            rows[index].total += Math.abs(tx.amount)
        }

        return rows
    })

    const insights = computed<ReportInsight[]>(() => {
        const result: ReportInsight[] = []

        const topCategory = categoryRows.value[0]
        if (topCategory) {
            result.push({
                title: 'Catégorie dominante',
                text: `${topCategory.name} représente ${formatMoney(topCategory.total)} sur la période.`,
            })
        }

        const expenseDelta = reportComparison.value.expense
        if (expenseDelta.delta !== 0) {
            result.push({
                title: 'Évolution des dépenses',
                text: expenseDelta.delta > 0
                    ? `Les dépenses augmentent de ${formatMoney(Math.abs(expenseDelta.delta))} par rapport à la période précédente.`
                    : `Les dépenses diminuent de ${formatMoney(Math.abs(expenseDelta.delta))} par rapport à la période précédente.`,
            })
        }

        const netDelta = reportComparison.value.net
        if (netDelta.delta !== 0) {
            result.push({
                title: 'Variation du net',
                text: netDelta.delta > 0
                    ? `Le résultat net s’améliore de ${formatMoney(Math.abs(netDelta.delta))}.`
                    : `Le résultat net recule de ${formatMoney(Math.abs(netDelta.delta))}.`,
            })
        }

        if (reportSummary.value.internalTransferCount > 0) {
            result.push({
                title: 'Transferts internes',
                text: `${reportSummary.value.internalTransferCount} transfert(s) interne(s) ont été exclus des revenus et dépenses du rapport.`,
            })
        }

        if (reportSummary.value.foreignTransactionCount > 0) {
            result.push({
                title: 'Exposition devises',
                text: `${reportSummary.value.foreignTransactionCount} transaction(s) ont été enregistrées dans une devise différente de celle du compte.`,
            })
        }

        return result
    })

    const reportMarkdown = computed(() => {
        const comparison = reportComparison.value
        const lines = [
            `# Rapport financier`,
            ``,
            `Période : ${formatDate(reportSummary.value.startDate)} → ${formatDate(reportSummary.value.endDate)}`,
            `Période précédente équivalente : ${formatDate(comparison.previousStartDate)} → ${formatDate(comparison.previousEndDate)}`,
            ``,
            `## Résumé`,
            `- Transactions : ${reportSummary.value.transactionCount}`,
            `- Revenus : ${formatMoney(reportSummary.value.income)}`,
            `- Dépenses : ${formatMoney(reportSummary.value.expense)}`,
            `- Net : ${formatMoney(reportSummary.value.net)}`,
            `- Taux d’épargne : ${reportSummary.value.savingsRate.toFixed(1)}%`,
            `- Dépense moyenne : ${formatMoney(reportSummary.value.averageExpense)}`,
            `- Revenu moyen : ${formatMoney(reportSummary.value.averageIncome)}`,
            `- Transactions en devise étrangère : ${reportSummary.value.foreignTransactionCount}`,
            `- Transferts internes : ${reportSummary.value.internalTransferCount}`,
            ``,
            `## Comparaisons intelligentes`,
            `- Revenus : ${formatMoney(comparison.income.current)} vs ${formatMoney(comparison.income.previous)} (${comparison.income.delta >= 0 ? '+' : ''}${formatMoney(comparison.income.delta)})`,
            `- Dépenses : ${formatMoney(comparison.expense.current)} vs ${formatMoney(comparison.expense.previous)} (${comparison.expense.delta >= 0 ? '+' : ''}${formatMoney(comparison.expense.delta)})`,
            `- Net : ${formatMoney(comparison.net.current)} vs ${formatMoney(comparison.net.previous)} (${comparison.net.delta >= 0 ? '+' : ''}${formatMoney(comparison.net.delta)})`,
            `- Taux d’épargne : ${comparison.savingsRate.current.toFixed(1)}% vs ${comparison.savingsRate.previous.toFixed(1)}%`,
            `- Transferts internes : ${comparison.internalTransferCount.current} vs ${comparison.internalTransferCount.previous}`,
            ``,
            `## Types de comptes`,
            `| Type | Comptes | Transactions | Revenus | Dépenses | Net |`,
            `|---|---:|---:|---:|---:|---:|`,
            ...accountTypeRows.value.map((row) =>
                `| ${accountTypeLabel(row.type)} | ${row.accountCount} | ${row.transactionCount} | ${formatMoney(row.income)} | ${formatMoney(row.expense)} | ${formatMoney(row.net)} |`,
            ),
            ``,
            `## Comptes`,
            `| Compte | Type | Devise | Transactions | Revenus | Dépenses | Net |`,
            `|---|---|---|---:|---:|---:|---:|`,
            ...accountRows.value.map((row) =>
                `| ${row.name} | ${accountTypeLabel(row.type)} | ${row.currency} | ${row.transactionCount} | ${formatMoney(row.income, row.currency)} | ${formatMoney(row.expense, row.currency)} | ${formatMoney(row.net, row.currency)} |`,
            ),
            ``,
            `## Catégories`,
            `| Catégorie | Transactions | Total | Nature |`,
            `|---|---:|---:|---|`,
            ...categoryRows.value.slice(0, 12).map((row) =>
                `| ${row.name} | ${row.transactionCount} | ${formatMoney(row.total)} | ${row.kind} |`,
            ),
            ``,
            `## Devises étrangères`,
            `| Devise | Transactions | Total source | Total comptabilisé |`,
            `|---|---:|---:|---:|`,
            ...foreignCurrencyRows.value.map((row) =>
                `| ${row.currency} | ${row.transactionCount} | ${row.sourceTotal.toFixed(2)} ${row.currency} | ${formatMoney(row.bookedTotal)} |`,
            ),
            ``,
            `## Points saillants`,
            ...insights.value.map((insight) => `- **${insight.title}** : ${insight.text}`),
            ``,
        ]

        return `${lines.join('\n')}\n`
    })

    async function exportPeriodReport() {
        const fileName = `budget-report-${reportStartDate.value}-to-${reportEndDate.value}.md`
        const result = await window.file.saveText({
            title: 'Exporter le rapport de période',
            defaultPath: fileName,
            content: reportMarkdown.value,
            filters: [{name: 'Markdown', extensions: ['md']}],
        })

        if (!result?.canceled) {
            options.showNotice('success', 'Rapport exporté.')
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
