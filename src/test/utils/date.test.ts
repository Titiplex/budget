import {describe, expect, it} from 'vitest'
import {
    addUtcDays,
    addUtcMonths,
    addUtcYears,
    endOfUtcDay,
    startOfUtcDay,
    toDateOnly,
    toUtcDate,
} from '../../utils/date'

describe('date utils', () => {
    it('keeps date-only values stable in UTC', () => {
        expect(toDateOnly('2026-04-01')).toBe('2026-04-01')
        expect(toDateOnly(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-04-01')
    })

    it('adds months without drifting because of timezone issues', () => {
        const result = addUtcMonths(toUtcDate('2026-04-01'), 1)
        expect(toDateOnly(result)).toBe('2026-05-01')
    })

    it('clamps leap-year dates correctly when adding years', () => {
        const result = addUtcYears(toUtcDate('2024-02-29'), 1)
        expect(toDateOnly(result)).toBe('2025-02-28')
    })

    it('adds days in UTC', () => {
        const result = addUtcDays(toUtcDate('2026-04-01'), 30)
        expect(toDateOnly(result)).toBe('2026-05-01')
    })

    it('builds start and end of UTC day safely', () => {
        expect(startOfUtcDay('2026-04-01').toISOString()).toBe('2026-04-01T00:00:00.000Z')
        expect(endOfUtcDay('2026-04-01').toISOString()).toBe('2026-04-01T23:59:59.999Z')
    })
})