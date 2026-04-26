import {describe, expect, it, vi} from 'vitest'
import type {SectionKey, TransactionKind} from '../../types/budget'
import {
    accountTypeLabel,
    amountClass,
    categoryDotStyle,
    entityCollectionLabel,
    entityLabel,
    formatDate,
    formatMoney,
    kindLabel,
    kindPillClass,
    sectionToEntityType,
} from '../../utils/budgetFormat'
import {i18n} from '../../i18n'

describe('budget format helpers', () => {
    it('formats money with the active locale and falls back to CAD for invalid currencies', () => {
        i18n.global.locale.value = 'en'

        expect(formatMoney(1234.5, 'CAD')).toContain('$1,234.50')
        expect(formatMoney(12, 'INVALID')).toContain('$12.00')
    })

    it('formats dates in UTC', () => {
        i18n.global.locale.value = 'en'

        expect(formatDate('2026-04-02T23:30:00.000Z')).toBe('Apr 2, 2026')
    })

    it('returns translated labels for kinds, account types and entities', () => {
        i18n.global.locale.value = 'en'

        expect(kindLabel('INCOME')).toBe('Income')
        expect(accountTypeLabel('BANK')).toBe('Bank account')
        expect(entityLabel('account')).toBe('account')
        expect(entityCollectionLabel('transaction')).toBe('transactions')
    })

    it('maps sections to their editable entity type', () => {
        expect(sectionToEntityType('accounts')).toBe('account')
        expect(sectionToEntityType('categories')).toBe('category')
        expect(sectionToEntityType('transactions')).toBe('transaction')
        expect(sectionToEntityType('overview' as SectionKey)).toBe('transaction')
    })

    it.each<[TransactionKind, string]>([
        ['INCOME', 'emerald'],
        ['EXPENSE', 'rose'],
        ['TRANSFER', 'sky'],
    ])('returns a distinct pill class for %s', (kind, expectedToken) => {
        expect(kindPillClass(kind)).toContain(expectedToken)
    })

    it.each<[TransactionKind, string]>([
        ['INCOME', 'emerald'],
        ['EXPENSE', 'rose'],
        ['TRANSFER', 'sky'],
    ])('returns a distinct amount class for %s', (kind, expectedToken) => {
        expect(amountClass(kind)).toContain(expectedToken)
    })

    it('builds category dot styles with a fallback color', () => {
        expect(categoryDotStyle('#123456')).toEqual({backgroundColor: '#123456'})
        expect(categoryDotStyle(null)).toEqual({backgroundColor: '#94a3b8'})
        expect(categoryDotStyle(undefined)).toEqual({backgroundColor: '#94a3b8'})
    })

    it('falls back to CAD when Intl rejects a currency code', () => {
        const originalNumberFormat = Intl.NumberFormat
        const spy = vi.spyOn(Intl, 'NumberFormat')
        spy.mockImplementation(((locale: string | string[] | undefined, options?: Intl.NumberFormatOptions) => {
            if (options?.currency === 'ZZZ') {
                throw new RangeError('Unsupported currency')
            }

            return new originalNumberFormat(locale, options)
        }) as typeof Intl.NumberFormat)

        expect(formatMoney(9.5, 'ZZZ')).toContain('$9.50')
    })
})
