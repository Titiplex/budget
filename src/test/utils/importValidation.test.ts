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

    it('validates backup references across all entity types including transfers', () => {
        const result = validateBackupSnapshot({
            kind: 'budget-backup',
            version: 3,
            exportedAt: '2026-04-20T00:00:00.000Z',
            data: {
                accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
                categories: [],
                budgetTargets: [{
                    id: 10,
                    name: 'Food budget',
                    amount: 100,
                    period: 'MONTHLY',
                    startDate: '2026-04-01T00:00:00.000Z',
                    endDate: null,
                    currency: 'CAD',
                    isActive: true,
                    note: null,
                    categoryId: 999,
                }],
                recurringTemplates: [{
                    id: 20,
                    label: 'Spotify',
                    sourceAmount: 12,
                    sourceCurrency: 'USD',
                    accountAmount: null,
                    conversionMode: 'AUTOMATIC',
                    exchangeRate: null,
                    exchangeProvider: 'ECB via Frankfurter',
                    kind: 'EXPENSE',
                    note: null,
                    frequency: 'MONTHLY',
                    intervalCount: 1,
                    startDate: '2026-04-01T00:00:00.000Z',
                    nextOccurrenceDate: '2026-05-01T00:00:00.000Z',
                    endDate: null,
                    isActive: true,
                    accountId: 999,
                    categoryId: null,
                }],
                transactions: [{
                    id: 2,
                    label: 'Broken transfer leg',
                    amount: 10,
                    sourceAmount: 12,
                    sourceCurrency: 'USD',
                    conversionMode: 'AUTOMATIC',
                    exchangeRate: 0.833333,
                    exchangeProvider: 'ECB via Frankfurter',
                    exchangeDate: '2026-04-20T00:00:00.000Z',
                    kind: 'TRANSFER',
                    date: '2026-04-20T00:00:00.000Z',
                    note: null,
                    accountId: 999,
                    categoryId: 123,
                    transferGroup: 'grp-1',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 998,
                }],
            },
        })

        expect(result.ok).toBe(false)
        expect(result.counts.budgetTargets).toBe(1)
        expect(result.counts.recurringTemplates).toBe(1)
        expect(result.warnings.length).toBeGreaterThan(0)
        expect(result.warnings.some((warning) => warning.includes('compte pair manquant'))).toBe(true)
    })
})
