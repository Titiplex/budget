import type {
    RecurringForecastOccurrence,
    RecurringFrequency,
    RecurringInsightSummary,
    RecurringTransactionTemplate,
} from '../types/budget'

function toDateOnly(value: string | Date) {
    if (typeof value === 'string') {
        return value.slice(0, 10)
    }
    return value.toISOString().slice(0, 10)
}

function round2(value: number) {
    return Math.round(value * 100) / 100
}

export function addRecurringInterval(date: Date, frequency: RecurringFrequency, intervalCount: number) {
    const next = new Date(date.getTime())

    if (frequency === 'DAILY') {
        next.setUTCDate(next.getUTCDate() + intervalCount)
        return next
    }

    if (frequency === 'WEEKLY') {
        next.setUTCDate(next.getUTCDate() + 7 * intervalCount)
        return next
    }

    if (frequency === 'MONTHLY') {
        next.setUTCMonth(next.getUTCMonth() + intervalCount)
        return next
    }

    next.setUTCFullYear(next.getUTCFullYear() + intervalCount)
    return next
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
    const start = new Date(`${toDateOnly(now)}T00:00:00.000Z`)
    const end = new Date(start.getTime())
    end.setUTCDate(end.getUTCDate() + horizonDays)

    const results: RecurringForecastOccurrence[] = []

    for (const template of templates) {
        if (!template.isActive) continue

        let cursor = new Date(template.nextOccurrenceDate)
        const endDate = template.endDate ? new Date(template.endDate) : null
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
        new Date(`${a.plannedDate}T00:00:00.000Z`).getTime()
        - new Date(`${b.plannedDate}T00:00:00.000Z`).getTime(),
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
        monthlyIncomeCommitment: monthlyIncomeCommitment,
        netMonthlyCommitment: round2(monthlyIncomeCommitment - monthlyExpenseCommitment),
        next30DaysExpense,
        next30DaysIncome,
        next30DaysNet: round2(next30DaysIncome - next30DaysExpense),
        upcomingCount: upcoming.length,
    }
}