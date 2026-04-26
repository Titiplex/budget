import {describe, expect, it} from 'vitest'
import {normalizeHeader, parseCsv, readCsvValue, toCsv} from '../../utils/csv'

describe('csv utils edge cases', () => {
    it('normalizes headers with accents, spacing, underscores and dashes', () => {
        expect(normalizeHeader('  Nom Catégorie  ')).toBe('nomcategorie')
        expect(normalizeHeader('source_currency')).toBe('sourcecurrency')
        expect(normalizeHeader('transfer-target-account')).toBe('transfertargetaccount')
    })

    it('parses CRLF rows, quoted line breaks and escaped quotes', () => {
        const rows = parseCsv('label,note\r\n"Rent","Line 1\nLine 2"\r\n"Quote","He said ""ok"""\r\n')

        expect(rows).toHaveLength(2)
        expect(rows[0]).toEqual({label: 'Rent', note: 'Line 1\nLine 2'})
        expect(rows[1]).toEqual({label: 'Quote', note: 'He said "ok"'})
    })

    it('ignores blank CSV rows and returns no records for empty/header-only content', () => {
        expect(parseCsv('')).toEqual([])
        expect(parseCsv('\n\n')).toEqual([])
        expect(parseCsv('name,type\n\n')).toEqual([])
        expect(parseCsv('name,type\nMain,BANK\n,\nCash,CASH\n')).toEqual([
            {name: 'Main', type: 'BANK'},
            {name: 'Cash', type: 'CASH'},
        ])
    })

    it('fills missing trailing cells with empty strings', () => {
        expect(parseCsv('name,type,currency\nMain,BANK\n')[0]).toEqual({
            name: 'Main',
            type: 'BANK',
            currency: '',
        })
    })

    it('escapes commas, quotes, newlines and surrounding spaces when serializing', () => {
        const csv = toCsv([
            {name: ' Main ', note: 'contains, comma', quote: 'say "yes"', lines: 'a\nb', missing: null},
        ], ['name', 'note', 'quote', 'lines', 'missing'])

        expect(csv).toContain('" Main "')
        expect(csv).toContain('"contains, comma"')
        expect(csv).toContain('"say ""yes"""')
        expect(csv).toContain('"a\nb"')
        expect(csv).toContain('\n')
    })

    it('returns an empty value when aliases are absent or blank', () => {
        expect(readCsvValue({name: '   ', nom: ''}, ['name', 'nom'])).toBe('')
        expect(readCsvValue({other: 'value'}, ['name', 'nom'])).toBe('')
    })
})
