import {describe, expect, it} from 'vitest'
import {i18n} from '../../i18n'

function messageKeys(messages: object, prefix = ''): string[] {
    return Object.entries(messages).flatMap(([name, value]) => {
        const path = prefix ? `${prefix}.${name}` : name
        return typeof value === 'string' ? [path] : messageKeys(value, path)
    }).sort()
}

describe('renderer translations', () => {
    it('provides the same messages in both supported languages', () => {
        const {getLocaleMessage} = i18n.global
        expect(messageKeys(getLocaleMessage('en'))).toEqual(messageKeys(getLocaleMessage('fr')))
    })

    it.each(['fr', 'en'] as const)('resolves transfer and report labels in %s', (language) => {
        for (const key of ['transfer.debitedAmount', 'reports.categoryPieAria', 'reports.otherCategories']) {
            expect(i18n.global.te(key, language)).toBe(true)
        }
    })
})
