export const fixedDateFixtures = Object.freeze({
    leapYear: {
        february29: '2024-02-29',
        nextNonLeapFebruaryEnd: '2025-02-28',
        nextLeapFebruaryEnd: '2028-02-29',
    },
    shortMonths: {
        january31LeapYear: '2024-01-31',
        january31CommonYear: '2023-01-31',
        january30CommonYear: '2023-01-30',
        january29LeapYear: '2024-01-29',
    },
    yearBoundary: {
        december31: '2025-12-31',
        january01: '2026-01-01',
        january31: '2026-01-31',
    },
    dstBoundary: {
        northAmericaSpringForwardSunday: '2026-03-08',
        oneWeekLater: '2026-03-15',
        twoWeeksLater: '2026-03-22',
    },
})

export const utcMonthAdditionCases = Object.freeze([
    {
        label: '31 January in a leap year clamps to 29 February',
        input: '2024-01-31',
        months: 1,
        expected: '2024-02-29',
    },
    {
        label: '31 January in a common year clamps to 28 February',
        input: '2023-01-31',
        months: 1,
        expected: '2023-02-28',
    },
    {
        label: '30 January in a common year clamps to 28 February',
        input: '2023-01-30',
        months: 1,
        expected: '2023-02-28',
    },
    {
        label: 'December rolls over to January without changing the year incorrectly',
        input: '2025-12-31',
        months: 1,
        expected: '2026-01-31',
    },
    {
        label: '29 February plus twelve months lands on 28 February in a non-leap year',
        input: '2024-02-29',
        months: 12,
        expected: '2025-02-28',
    },
])

export const utcYearAdditionCases = Object.freeze([
    {
        label: '29 February plus one year lands on 28 February',
        input: '2024-02-29',
        years: 1,
        expected: '2025-02-28',
    },
    {
        label: '29 February plus four years stays on 29 February',
        input: '2024-02-29',
        years: 4,
        expected: '2028-02-29',
    },
    {
        label: '31 December plus one year stays on 31 December',
        input: '2025-12-31',
        years: 1,
        expected: '2026-12-31',
    },
])

export const recurrenceDateSequences = Object.freeze({
    monthlyFrom31LeapYear: ['2024-01-31', '2024-02-29', '2024-03-29', '2024-04-29'],
    monthlyFrom30CommonYear: ['2023-01-30', '2023-02-28', '2023-03-28', '2023-04-28'],
    monthlyFrom29LeapYear: ['2024-01-29', '2024-02-29', '2024-03-29', '2024-04-29'],
    weeklyAcrossDst: ['2026-03-08', '2026-03-15', '2026-03-22'],
    yearlyFromLeapDay: ['2024-02-29', '2025-02-28', '2026-02-28'],
    decemberToJanuary: ['2025-12-31', '2026-01-31'],
})

export const reportPeriodFixtures = Object.freeze({
    leapFebruary: {
        startDate: '2024-02-01',
        endDate: '2024-02-29',
        previousStartDate: '2024-01-03',
        previousEndDate: '2024-01-31',
        daySpan: 29,
    },
    januaryFullMonth: {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        previousStartDate: '2025-12-01',
        previousEndDate: '2025-12-31',
        daySpan: 31,
    },
    singleDayAfterLeapDay: {
        startDate: '2024-03-01',
        endDate: '2024-03-01',
        previousStartDate: '2024-02-29',
        previousEndDate: '2024-02-29',
        daySpan: 1,
    },
})

export const projectionDateFixtures = Object.freeze({
    leapDayStart: {
        startDate: '2024-02-29',
        normalizedStartDate: '2024-02-01',
        months: ['2024-03-01', '2024-04-01', '2024-05-01'],
    },
    yearBoundaryStart: {
        startDate: '2025-12-31',
        normalizedStartDate: '2025-12-01',
        months: ['2026-01-01', '2026-02-01'],
    },
    reachableEstimate: {
        startDate: '2026-01-31',
        estimatedReachDate: '2026-04-01',
        estimatedMonthsToReach: 3,
    },
})
