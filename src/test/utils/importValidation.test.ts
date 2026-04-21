import {describe, expect, it} from 'vitest'
import {summarizeCsvRows, validateBackupSnapshot} from '../../utils/importValidation'

describe('import validation', () => {
    it('summarizes account csv rows', () => {
        const summary = summarizeCsvRows('account', [
            {name: 'Main'},
            {nom: 'Cash'},
            {foo: 'bar'},
        ])

        expect(summary.totalRows).toBe(3)
        expect(summary.validRows).toBe(2)
        expect(summary.invalidRows).toBe(1)
        expect(summary.warnings.length).toBeGreaterThan(0)
    })

    it('validates backup references', () => {
        const result = validateBackupSnapshot({
            kind: 'budget-backup',
            version: 1,
            exportedAt: '2026-04-20T00:00:00.000Z',
            data: {
                accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
                categories: [],
                transactions: [{
                    id: 2,
                    label: 'Broken tx',
                    amount: 10,
                    sourceAmount: 12,
                    sourceCurrency: 'USD',
                    conversionMode: 'AUTOMATIC',
                    exchangeRate: 0.833333,
                    exchangeProvider: 'ECB via Frankfurter',
                    exchangeDate: '2026-04-20T00:00:00.000Z',
                    kind: 'EXPENSE',
                    date: '2026-04-20T00:00:00.000Z',
                    note: null,
                    accountId: 999,
                    categoryId: null,
                }],
            },
        })

        expect(result.ok).toBe(false)
        expect(result.warnings.length).toBeGreaterThan(0)
    })
})