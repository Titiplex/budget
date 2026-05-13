import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'
import {recurrenceDateSequences} from '../fixtures/dateEdgeCaseFixtures'

const require = createRequire(import.meta.url)
const {
    addUtcDays,
    addUtcMonths,
    addUtcWeeks,
    addUtcYears,
    endOfUtcDay,
    requireDate,
} = require('../../../electron/utils/date')

function dateOnly(value) {
    return value.toISOString().slice(0, 10)
}

function addInterval(date, frequency, intervalCount) {
    if (frequency === 'DAILY') return addUtcDays(date, intervalCount)
    if (frequency === 'WEEKLY') return addUtcWeeks(date, intervalCount)
    if (frequency === 'MONTHLY') return addUtcMonths(date, intervalCount)
    if (frequency === 'YEARLY') return addUtcYears(date, intervalCount)
    throw new Error(`Unsupported fixture frequency: ${frequency}`)
}

function generateOccurrences({
    nextOccurrenceDate,
    frequency,
    intervalCount = 1,
    asOfDate,
    endDate = null,
}) {
    const asOf = endOfUtcDay(asOfDate)
    const end = endDate ? endOfUtcDay(endDate) : null
    const occurrences = []
    let cursor = requireDate(nextOccurrenceDate, 'nextOccurrenceDate')
    let guard = 0

    while (cursor.getTime() <= asOf.getTime() && (!end || cursor.getTime() <= end.getTime())) {
        occurrences.push(dateOnly(cursor))
        cursor = addInterval(cursor, frequency, intervalCount)
        guard += 1

        if (guard > 60) {
            throw new Error('Recurring fixture generated too many occurrences.')
        }
    }

    return occurrences
}

describe('recurrence date edge cases', () => {
    it('generates monthly occurrences from the 31st through a leap-year February without invalid dates', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2024-01-31',
            frequency: 'MONTHLY',
            asOfDate: '2024-04-30',
        })).toEqual(recurrenceDateSequences.monthlyFrom31LeapYear)
    })

    it('generates monthly occurrences from the 30th through a common-year February without off-by-one loops', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2023-01-30',
            frequency: 'MONTHLY',
            asOfDate: '2023-04-30',
        })).toEqual(recurrenceDateSequences.monthlyFrom30CommonYear)
    })

    it('keeps the 29th stable when February in a leap year supports it', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2024-01-29',
            frequency: 'MONTHLY',
            asOfDate: '2024-04-30',
        })).toEqual(recurrenceDateSequences.monthlyFrom29LeapYear)
    })

    it('generates weekly occurrences across a daylight-saving boundary using UTC calendar math', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2026-03-08',
            frequency: 'WEEKLY',
            asOfDate: '2026-03-22',
        })).toEqual(recurrenceDateSequences.weeklyAcrossDst)
    })

    it('generates annual occurrences from leap day by clamping to February 28 in non-leap years', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2024-02-29',
            frequency: 'YEARLY',
            asOfDate: '2026-03-01',
        })).toEqual(recurrenceDateSequences.yearlyFromLeapDay)
    })

    it('generates monthly occurrences across December to January', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2025-12-31',
            frequency: 'MONTHLY',
            asOfDate: '2026-01-31',
        })).toEqual(recurrenceDateSequences.decemberToJanuary)
    })

    it('includes due occurrences on the as-of date and excludes the next day', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2026-01-31',
            frequency: 'MONTHLY',
            asOfDate: '2026-02-27',
        })).toEqual(['2026-01-31'])

        expect(generateOccurrences({
            nextOccurrenceDate: '2026-01-31',
            frequency: 'MONTHLY',
            asOfDate: '2026-02-28',
        })).toEqual(['2026-01-31', '2026-02-28'])
    })

    it('stops at the recurrence end date without creating an extra occurrence', () => {
        expect(generateOccurrences({
            nextOccurrenceDate: '2026-01-31',
            frequency: 'MONTHLY',
            asOfDate: '2026-04-30',
            endDate: '2026-02-28',
        })).toEqual(['2026-01-31', '2026-02-28'])
    })
})
