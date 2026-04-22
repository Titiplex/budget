import type {ReportComparisonSummary, ReportMetricComparison, ReportSummary, Transaction} from '../types/budget'
import {addUtcDays, endOfUtcDay, startOfUtcDay, toDateOnly, toUtcDate} from './date'

function round2(value: number) {
    return Math.round(value * 100) / 100
}

export function withinRange(date: string, startDate: string, endDate: string) {
    const tx = toUtcDate(date).getTime()
    const start = startOfUtcDay(startDate).getTime()
    const end = endOfUtcDay(endDate).getTime()
    return tx >= start && tx <= end
}

export function buildPreviousPeriod(startDate: string, endDate: string) {
    const start = startOfUtcDay(startDate)
    const end = startOfUtcDay(endDate)
    const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)

    const previousEnd = addUtcDays(start, -1)
    const previousStart = addUtcDays(previousEnd, -(daySpan - 1))

    return {
        previousStartDate: toDateOnly(previousStart),
        previousEndDate: toDateOnly(previousEnd),
        daySpan,
    }
}

export function summarizeTransactions(transactions: Transaction[], startDate: string, endDate: string): ReportSummary {
    const incomeRows = transactions.filter((tx) => tx.kind === 'INCOME')
    const expenseRows = transactions.filter((tx) => tx.kind === 'EXPENSE')
    const transferRows = transactions.filter((tx) => tx.kind === 'TRANSFER' && tx.transferGroup)

    const income = incomeRows.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    const expense = expenseRows.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    const net = income - expense

    const foreignCount = transactions.filter((tx) => {
        const sourceCurrency = (tx.sourceCurrency || tx.account?.currency || '').toUpperCase()
        const accountCurrency = (tx.account?.currency || '').toUpperCase()
        return sourceCurrency && accountCurrency && sourceCurrency !== accountCurrency
    }).length

    return {
        startDate,
        endDate,
        transactionCount: transactions.length,
        income: round2(income),
        expense: round2(expense),
        net: round2(net),
        savingsRate: income > 0 ? round2((net / income) * 100) : 0,
        averageExpense: expenseRows.length ? round2(expense / expenseRows.length) : 0,
        averageIncome: incomeRows.length ? round2(income / incomeRows.length) : 0,
        foreignTransactionCount: foreignCount,
        internalTransferCount: new Set(transferRows.map((tx) => tx.transferGroup)).size,
    }
}

export function buildMetricComparison(current: number, previous: number): ReportMetricComparison {
    const delta = round2(current - previous)
    let deltaPercent: number | null = null

    if (previous !== 0) {
        deltaPercent = round2((delta / previous) * 100)
    } else if (current === 0) {
        deltaPercent = 0
    }

    return {
        current: round2(current),
        previous: round2(previous),
        delta,
        deltaPercent,
        trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    }
}

export function buildReportComparison(current: ReportSummary, previous: ReportSummary): ReportComparisonSummary {
    return {
        previousStartDate: previous.startDate,
        previousEndDate: previous.endDate,
        transactionCount: buildMetricComparison(current.transactionCount, previous.transactionCount),
        income: buildMetricComparison(current.income, previous.income),
        expense: buildMetricComparison(current.expense, previous.expense),
        net: buildMetricComparison(current.net, previous.net),
        savingsRate: buildMetricComparison(current.savingsRate, previous.savingsRate),
        averageExpense: buildMetricComparison(current.averageExpense, previous.averageExpense),
        averageIncome: buildMetricComparison(current.averageIncome, previous.averageIncome),
        foreignTransactionCount: buildMetricComparison(current.foreignTransactionCount, previous.foreignTransactionCount),
        internalTransferCount: buildMetricComparison(current.internalTransferCount, previous.internalTransferCount),
    }
}