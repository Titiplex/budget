const SURPLUS_SOURCES = Object.freeze({
    AUTOMATIC_FROM_BUDGET: 'automaticFromBudget',
    AUTOMATIC_FROM_RECURRING: 'automaticFromRecurring',
    MANUAL_OVERRIDE: 'manualOverride',
    UNAVAILABLE: 'unavailable',
})

const SURPLUS_ERROR_CODES = Object.freeze({
    INVALID_MANUAL_CONTRIBUTION: 'invalidManualContribution',
    INVALID_CURRENCY: 'invalidCurrency',
    INVALID_LOOKBACK: 'invalidLookback',
    INVALID_REFERENCE_DATE: 'invalidReferenceDate',
})

class MonthlySurplusEstimatorError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'MonthlySurplusEstimatorError'
        this.code = code
        this.field = options.field || null
        this.details = options.details || null
        this.recoverable = options.recoverable ?? true
    }
}

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCurrency(value, fallback = 'CAD') {
    const normalized = (normalizeText(value) || fallback).toUpperCase()

    if (!/^[A-Z]{3}$/.test(normalized)) {
        throw new MonthlySurplusEstimatorError(
            SURPLUS_ERROR_CODES.INVALID_CURRENCY,
            'La devise doit être un code ISO à 3 lettres.',
            {field: 'currency'},
        )
    }

    return normalized
}

function normalizeNonNegativeNumber(value, fieldName, fallback = null) {
    if (value == null || value === '') return fallback

    const parsed = Number(value)

    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new MonthlySurplusEstimatorError(
            SURPLUS_ERROR_CODES.INVALID_MANUAL_CONTRIBUTION,
            'La contribution mensuelle manuelle doit être positive ou nulle.',
            {field: fieldName},
        )
    }

    return parsed
}

function normalizeLookbackMonths(value) {
    const parsed = value == null || value === '' ? 3 : Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 60) {
        throw new MonthlySurplusEstimatorError(
            SURPLUS_ERROR_CODES.INVALID_LOOKBACK,
            'La période d’analyse doit être comprise entre 1 et 60 mois.',
            {field: 'lookbackMonths'},
        )
    }

    return parsed
}

function parseReferenceDate(value) {
    const date = value == null || value === '' ? new Date() : value instanceof Date ? new Date(value.getTime()) : new Date(value)

    if (Number.isNaN(date.getTime())) {
        throw new MonthlySurplusEstimatorError(
            SURPLUS_ERROR_CODES.INVALID_REFERENCE_DATE,
            'La date de référence est invalide.',
            {field: 'referenceDate'},
        )
    }

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addUtcMonths(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function roundMoney(value) {
    if (!Number.isFinite(value)) return 0
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function getRowAmount(row) {
    const candidate = row?.accountAmount ?? row?.amount ?? row?.sourceAmount ?? 0
    const parsed = Number(candidate)
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0
}

function monthlyizeBudgetAmount(target) {
    const amount = getRowAmount(target)
    const period = String(target?.period || 'MONTHLY').toUpperCase()

    if (period === 'MONTHLY') return amount
    if (period === 'YEARLY') return amount / 12

    const start = target?.startDate ? new Date(target.startDate) : null
    const end = target?.endDate ? new Date(target.endDate) : null

    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
        const months = Math.max(
            1,
            (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1,
        )
        return amount / months
    }

    return amount
}

function monthlyizeRecurringAmount(template) {
    const amount = getRowAmount(template)
    const interval = Math.max(1, Number(template?.intervalCount) || 1)
    const frequency = String(template?.frequency || 'MONTHLY').toUpperCase()

    if (frequency === 'DAILY') return amount * (365.25 / 12) / interval
    if (frequency === 'WEEKLY') return amount * (52.1428571429 / 12) / interval
    if (frequency === 'YEARLY') return amount / (12 * interval)

    return amount / interval
}

function summarizeRowsByKind(rows, amountMapper) {
    return rows.reduce(
        (summary, row) => {
            const kind = String(row?.kind || row?.category?.kind || '').toUpperCase()

            if (kind === 'TRANSFER') {
                summary.ignoredTransferCount += 1
                return summary
            }

            const amount = amountMapper(row)

            if (kind === 'INCOME') {
                summary.income += amount
                summary.incomeCount += 1
            } else if (kind === 'EXPENSE') {
                summary.expense += amount
                summary.expenseCount += 1
            }

            return summary
        },
        {income: 0, expense: 0, incomeCount: 0, expenseCount: 0, ignoredTransferCount: 0},
    )
}

async function readBudgetTargets(prisma, currency) {
    if (!prisma?.budgetTarget?.findMany) return []

    return prisma.budgetTarget.findMany({
        where: {isActive: true, currency},
        include: {category: true},
        orderBy: [{period: 'asc'}, {name: 'asc'}],
    })
}

async function readRecurringTemplates(prisma, currency) {
    if (!prisma?.recurringTransactionTemplate?.findMany) return []

    return prisma.recurringTransactionTemplate.findMany({
        where: {isActive: true, sourceCurrency: currency},
        include: {category: true, account: true},
        orderBy: [{kind: 'asc'}, {label: 'asc'}],
    })
}

async function readTransactions(prisma, currency, startDate, endDate) {
    if (!prisma?.transaction?.findMany) return []

    return prisma.transaction.findMany({
        where: {
            kind: {in: ['INCOME', 'EXPENSE']},
            date: {gte: startDate, lt: endDate},
            OR: [{sourceCurrency: currency}, {sourceCurrency: null}],
        },
        include: {category: true, account: true},
        orderBy: [{date: 'desc'}],
    })
}

function summarizeBudgetTargets(targets) {
    const summary = summarizeRowsByKind(targets, monthlyizeBudgetAmount)

    return {
        estimatedMonthlyIncome: roundMoney(summary.income),
        estimatedMonthlyExpense: roundMoney(summary.expense),
        estimatedNetMonthly: roundMoney(summary.income - summary.expense),
        incomeTargetCount: summary.incomeCount,
        expenseTargetCount: summary.expenseCount,
        ignoredTransferCount: summary.ignoredTransferCount,
        targetCount: targets.length,
    }
}

function summarizeRecurringTemplates(templates) {
    const summary = summarizeRowsByKind(templates, monthlyizeRecurringAmount)

    return {
        estimatedMonthlyIncome: roundMoney(summary.income),
        estimatedMonthlyExpense: roundMoney(summary.expense),
        estimatedNetMonthly: roundMoney(summary.income - summary.expense),
        incomeTemplateCount: summary.incomeCount,
        expenseTemplateCount: summary.expenseCount,
        ignoredTransferCount: summary.ignoredTransferCount,
        templateCount: templates.length,
    }
}

function summarizeHistoricalTransactions(transactions, lookbackMonths) {
    const summary = summarizeRowsByKind(transactions, getRowAmount)
    const divisor = Math.max(1, lookbackMonths)
    const monthlyIncome = summary.income / divisor
    const monthlyExpense = summary.expense / divisor

    return {
        estimatedMonthlyIncome: roundMoney(monthlyIncome),
        estimatedMonthlyExpense: roundMoney(monthlyExpense),
        estimatedNetMonthly: roundMoney(monthlyIncome - monthlyExpense),
        incomeTransactionCount: summary.incomeCount,
        expenseTransactionCount: summary.expenseCount,
        ignoredTransferCount: summary.ignoredTransferCount,
        transactionCount: transactions.length,
        lookbackMonths: divisor,
    }
}

function chooseAutomaticEstimate({budget, recurring, historical}) {
    const hasBudgetSignal = budget.targetCount > 0 || historical.transactionCount > 0
    const hasRecurringSignal = recurring.templateCount > 0

    if (hasBudgetSignal) {
        const income = historical.estimatedMonthlyIncome || recurring.estimatedMonthlyIncome || budget.estimatedMonthlyIncome
        const expense = budget.estimatedMonthlyExpense || historical.estimatedMonthlyExpense || recurring.estimatedMonthlyExpense
        const net = income - expense

        return {
            source: SURPLUS_SOURCES.AUTOMATIC_FROM_BUDGET,
            estimatedMonthlyIncome: roundMoney(income),
            estimatedMonthlyExpense: roundMoney(expense),
            netMonthlyEstimate: roundMoney(net),
            estimatedMonthlySurplus: roundMoney(Math.max(0, net)),
        }
    }

    if (hasRecurringSignal) {
        return {
            source: SURPLUS_SOURCES.AUTOMATIC_FROM_RECURRING,
            estimatedMonthlyIncome: recurring.estimatedMonthlyIncome,
            estimatedMonthlyExpense: recurring.estimatedMonthlyExpense,
            netMonthlyEstimate: recurring.estimatedNetMonthly,
            estimatedMonthlySurplus: roundMoney(Math.max(0, recurring.estimatedNetMonthly)),
        }
    }

    return {
        source: SURPLUS_SOURCES.UNAVAILABLE,
        estimatedMonthlyIncome: 0,
        estimatedMonthlyExpense: 0,
        netMonthlyEstimate: 0,
        estimatedMonthlySurplus: 0,
    }
}

async function estimateMonthlySurplus(prisma, options = {}) {
    const currency = normalizeCurrency(options.currency)
    const manualMonthlyContribution = normalizeNonNegativeNumber(
        options.manualMonthlyContribution ?? options.manualContribution,
        'manualMonthlyContribution',
        null,
    )
    const lookbackMonths = normalizeLookbackMonths(options.lookbackMonths)
    const referenceDate = parseReferenceDate(options.referenceDate)
    const historyStartDate = addUtcMonths(referenceDate, -lookbackMonths + 1)
    const historyEndDate = addUtcMonths(referenceDate, 1)

    const [budgetTargets, recurringTemplates, transactions] = await Promise.all([
        readBudgetTargets(prisma, currency),
        readRecurringTemplates(prisma, currency),
        readTransactions(prisma, currency, historyStartDate, historyEndDate),
    ])

    const budget = summarizeBudgetTargets(budgetTargets)
    const recurring = summarizeRecurringTemplates(recurringTemplates)
    const historical = summarizeHistoricalTransactions(transactions, lookbackMonths)
    const automatic = chooseAutomaticEstimate({budget, recurring, historical})
    const source = manualMonthlyContribution == null ? automatic.source : SURPLUS_SOURCES.MANUAL_OVERRIDE
    const monthlyContributionUsed = manualMonthlyContribution == null
        ? automatic.estimatedMonthlySurplus
        : manualMonthlyContribution

    return {
        source,
        currency,
        monthlyContributionUsed: roundMoney(monthlyContributionUsed),
        manualMonthlyContribution,
        estimatedMonthlySurplus: automatic.estimatedMonthlySurplus,
        estimatedMonthlyIncome: automatic.estimatedMonthlyIncome,
        estimatedMonthlyExpense: automatic.estimatedMonthlyExpense,
        netMonthlyEstimate: automatic.netMonthlyEstimate,
        referenceMonth: referenceDate.toISOString().slice(0, 10),
        historyStartDate: historyStartDate.toISOString().slice(0, 10),
        historyEndDate: historyEndDate.toISOString().slice(0, 10),
        breakdown: {
            budget,
            recurring,
            historical,
        },
        warnings: automatic.source === SURPLUS_SOURCES.UNAVAILABLE
            ? ['Aucune donnée budget, historique ou récurrente exploitable pour estimer un surplus mensuel.']
            : [],
    }
}

function toMonthlySurplusIpcError(error) {
    if (error instanceof MonthlySurplusEstimatorError) {
        return {
            code: error.code,
            message: error.message,
            field: error.field,
            details: error.details,
            recoverable: error.recoverable,
        }
    }

    return {
        code: 'unknownMonthlySurplusError',
        message: error?.message || 'Erreur inconnue pendant l’estimation du surplus mensuel.',
        field: null,
        details: null,
        recoverable: false,
    }
}

module.exports = {
    SURPLUS_ERROR_CODES,
    SURPLUS_SOURCES,
    MonthlySurplusEstimatorError,
    chooseAutomaticEstimate,
    estimateMonthlySurplus,
    monthlyizeBudgetAmount,
    monthlyizeRecurringAmount,
    normalizeCurrency,
    summarizeBudgetTargets,
    summarizeHistoricalTransactions,
    summarizeRecurringTemplates,
    toMonthlySurplusIpcError,
}
