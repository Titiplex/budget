import {describe, expect, it} from 'vitest'
import {parseCsv, readCsvValue, toCsv} from '../../utils/csv'

describe('csv utils', () => {
    it('parses simple csv rows', () => {
        const rows = parseCsv('name,type\nMain,BANK\nCash,CASH\n')
        expect(rows).toHaveLength(2)
        expect(rows[0].name).toBe('Main')
        expect(rows[1].type).toBe('CASH')
    })

    it('supports quoted values', () => {
        const rows = parseCsv('label,note\n"Rent","Paid, monthly"\n')
        expect(rows[0].label).toBe('Rent')
        expect(rows[0].note).toBe('Paid, monthly')
    })

    it('reads aliases', () => {
        const row = {nom: 'Compte principal'}
        expect(readCsvValue(row, ['name', 'nom'])).toBe('Compte principal')
    })

    it('serializes csv', () => {
        const content = toCsv(
            [{name: 'Main', description: 'Primary account'}],
            ['name', 'description'],
        )

        expect(content).toContain('name,description')
        expect(content).toContain('Main,Primary account')
    })
})