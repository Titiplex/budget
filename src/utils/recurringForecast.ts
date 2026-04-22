import type {
    RecurringForecastOccurrence,
    RecurringFrequency,
    RecurringInsightSummary,
    RecurringTransactionTemplate,
} from '../types/budget'
import {
    addUtcDays,
    addUtcMonths,
    addUtcWeeks,
    addUtcYears,
    startOfUtcDay,
    toDateOnly,
    toUtcDate,
} from './date'

function round2(value: number) {
    return Math.round(value * 100) / 100
}

export function addRecurringInterval(date: Date, frequency: RecurringFrequency, intervalCount: number) {
    if (frequency === 'DAILY') {
        return addUtcDays(date, intervalCount)
    }

    if (frequency === 'WEEKLY') {
        return addUtcWeeks(date, intervalCount)
    }

    if (frequency === 'MONTHLY') {
        return addUtcMonths(date, intervalCount)
    }

    return addUtcYears(date, intervalCount)
}

export function estimateMonthlyEquivalent(template: RecurringTransactionTemplate) {
    const amount = template.accountAmount ?? template.sourceAmount

    if (template.frequency === 'DAILY') {
        return round2((30.4375 / template.intervalCount) * amount)
    }

    if (template.frequency === 'WEEKLY') {
        return round2((4.34524 / template.intervalCount) * amount)
    }

    if (template.frequency === 'MONTHLY') {
        return round2((1 / template.intervalCount) * amount)
    }

    return round2((1 / (12 * template.intervalCount)) * amount)
}

export function buildRecurringForecast(
    templates: RecurringTransactionTemplate[],
    horizonDays = 30,
    now = new Date(),
): RecurringForecastOccurrence[] {
    const start = startOfUtcDay(now)
    const end = addUtcDays(start, horizonDays)

    const results: RecurringForecastOccurrence[] = []

    for (const template of templates) {
        if (!template.isActive) continue

        let cursor = toUtcDate(template.nextOccurrenceDate)
        const endDate = template.endDate ? toUtcDate(template.endDate) : null
        let guard = 0

        while (
            cursor.getTime() <= end.getTime()
            && (!endDate || cursor.getTime() <= endDate.getTime())
            ) {
            if (cursor.getTime() >= start.getTime()) {
                results.push({
                    templateId: template.id,
                    label: template.label,
                    kind: template.kind,
                    plannedDate: toDateOnly(cursor),
                    amount: template.accountAmount ?? template.sourceAmount,
                    currency: template.account?.currency || template.sourceCurrency,
                    accountName: template.account?.name || 'Compte inconnu',
                    categoryName: template.category?.name || 'Sans catégorie',
                })
            }

            cursor = addRecurringInterval(cursor, template.frequency, template.intervalCount)
            guard += 1

            if (guard > 500) break
        }
    }

    return results.sort((a, b) =>
        startOfUtcDay(a.plannedDate).getTime() - startOfUtcDay(b.plannedDate).getTime(),
    )
}

export function summarizeRecurringForecast(
    templates: RecurringTransactionTemplate[],
    upcoming: RecurringForecastOccurrence[],
): RecurringInsightSummary {
    const activeTemplates = templates.filter((template) => template.isActive)

    const monthlyExpenseCommitment = round2(
        activeTemplates
            .filter((template) => template.kind === 'EXPENSE')
            .reduce((sum, template) => sum + estimateMonthlyEquivalent(template), 0),
    )

    const monthlyIncomeCommitment = round2(
        activeTemplates
            .filter((template) => template.kind === 'INCOME')
            .reduce((sum, template) => sum + estimateMonthlyEquivalent(template), 0),
    )

    const next30DaysExpense = round2(
        upcoming
            .filter((item) => item.kind === 'EXPENSE')
            .reduce((sum, item) => sum + item.amount, 0),
    )

    const next30DaysIncome = round2(
        upcoming
            .filter((item) => item.kind === 'INCOME')
            .reduce((sum, item) => sum + item.amount, 0),
    )

    return {
        activeCount: activeTemplates.length,
        monthlyExpenseCommitment,
        monthlyIncomeCommitment,
        netMonthlyCommitment: round2(monthlyIncomeCommitment - monthlyExpenseCommitment),
        next30DaysExpense,
        next30DaysIncome,
        next30DaysNet: round2(next30DaysIncome - next30DaysExpense),
        upcomingCount: upcoming.length,
    }
}