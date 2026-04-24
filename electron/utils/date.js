const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateOnlyString(value) {
    return typeof value === 'string' && DATE_ONLY_RE.test(value)
}

function toUtcDate(value) {
    if (value instanceof Date) {
        return new Date(value.getTime())
    }

    if (isDateOnlyString(value)) {
        return new Date(`${value}T00:00:00.000Z`)
    }

    return new Date(value)
}

function requireDate(value, fieldName = 'La date') {
    const date = toUtcDate(value)
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} est invalide.`)
    }
    return date
}

function toDateOnly(value) {
    if (isDateOnlyString(value)) {
        return value
    }

    return requireDate(value).toISOString().slice(0, 10)
}

function startOfUtcDay(value = new Date()) {
    return new Date(`${toDateOnly(value)}T00:00:00.000Z`)
}

function endOfUtcDay(value = new Date()) {
    const end = startOfUtcDay(value)
    end.setUTCHours(23, 59, 59, 999)
    return end
}

function addUtcDays(date, days) {
    const next = new Date(date.getTime())
    next.setUTCDate(next.getUTCDate() + days)
    return next
}

function addUtcWeeks(date, weeks) {
    return addUtcDays(date, weeks * 7)
}

function addUtcMonths(date, months) {
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

function addUtcYears(date, years) {
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

module.exports = {
    isDateOnlyString,
    toUtcDate,
    requireDate,
    toDateOnly,
    startOfUtcDay,
    endOfUtcDay,
    addUtcDays,
    addUtcWeeks,
    addUtcMonths,
    addUtcYears,
}