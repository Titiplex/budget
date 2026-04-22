const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateOnlyString(value: string) {
    return DATE_ONLY_RE.test(value)
}

export function toUtcDate(value: string | Date) {
    if (value instanceof Date) {
        return new Date(value.getTime())
    }

    if (isDateOnlyString(value)) {
        return new Date(`${value}T00:00:00.000Z`)
    }

    return new Date(value)
}

export function toDateOnly(value: string | Date) {
    if (typeof value === 'string' && isDateOnlyString(value)) {
        return value
    }

    return toUtcDate(value).toISOString().slice(0, 10)
}

export function startOfUtcDay(value: string | Date = new Date()) {
    return new Date(`${toDateOnly(value)}T00:00:00.000Z`)
}

export function endOfUtcDay(value: string | Date = new Date()) {
    const end = startOfUtcDay(value)
    end.setUTCHours(23, 59, 59, 999)
    return end
}

export function addUtcDays(date: Date, days: number) {
    const next = new Date(date.getTime())
    next.setUTCDate(next.getUTCDate() + days)
    return next
}

export function addUtcWeeks(date: Date, weeks: number) {
    return addUtcDays(date, weeks * 7)
}

export function addUtcMonths(date: Date, months: number) {
    const next = new Date(date.getTime())
    const originalDay = next.getUTCDate()

    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + months)

    const lastDayOfTargetMonth = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate()

    next.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
    return next
}

export function addUtcYears(date: Date, years: number) {
    const next = new Date(date.getTime())
    const originalMonth = next.getUTCMonth()
    const originalDay = next.getUTCDate()

    next.setUTCDate(1)
    next.setUTCFullYear(next.getUTCFullYear() + years)
    next.setUTCMonth(originalMonth)

    const lastDayOfTargetMonth = new Date(
        Date.UTC(next.getUTCFullYear(), originalMonth + 1, 0),
    ).getUTCDate()

    next.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
    return next
}