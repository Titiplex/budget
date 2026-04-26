import {describe, expect, it} from 'vitest'
import {summarizeCsvRows, validateBackupSnapshot} from '../../utils/importValidation'
import type {BudgetBackupSnapshot} from '../../types/budget'

function snapshot(overrides: Partial<BudgetBackupSnapshot['data']> = {}): BudgetBackupSnapshot {
    return {
        kind: 'budget-backup',
        version: 4,
        exportedAt: '2026-04-20T00:00:00.000Z',
        data: {
            accounts: [
                {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
                {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
            ],
            categories: [
                {id: 10, name: 'Groceries', kind: 'EXPENSE', color: '#22c55e', description: null},
            ],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [],
            taxProfiles: [],
            ...overrides,
        },
    }
}

describe('import validation extended warnings', () => {
    it('summarizes category and transaction CSV rows with warning counts', () => {
        expect(summarizeCsvRows('category', [
            {name: 'Groceries'},
            {nom: 'Salaire'},
            {kind: 'EXPENSE'},
        ])).toMatchObject({totalRows: 3, validRows: 2, invalidRows: 1})

        expect(summarizeCsvRows('transaction', [
            {label: 'A', amount: '10', date: '2026-04-01'},
            {libelle: 'B', montant: '20', date: '2026-04-02'},
            {label: 'Missing amount', date: '2026-04-03'},
        ])).toMatchObject({totalRows: 3, validRows: 2, invalidRows: 1})
    })

    it('accepts a fully coherent backup snapshot', () => {
        const result = validateBackupSnapshot(snapshot({
            budgetTargets: [{
                id: 20,
                name: 'Food',
                amount: 500,
                period: 'MONTHLY',
                startDate: '2026-04-01',
                endDate: null,
                currency: 'CAD',
                isActive: true,
                note: null,
                categoryId: 10,
            }],
            recurringTemplates: [{
                id: 30,
                label: 'Rent',
                sourceAmount: 1200,
                sourceCurrency: 'CAD',
                accountAmount: 1200,
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                kind: 'EXPENSE',
                note: null,
                frequency: 'MONTHLY',
                intervalCount: 1,
                startDate: '2026-04-01',
                nextOccurrenceDate: '2026-05-01',
                endDate: null,
                isActive: true,
                accountId: 1,
                categoryId: 10,
            }],
            transactions: [
                {
                    id: 100,
                    label: 'Move out',
                    amount: 50,
                    sourceAmount: 50,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'grp-1',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 2,
                },
                {
                    id: 101,
                    label: 'Move in',
                    amount: 50,
                    sourceAmount: 50,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 2,
                    categoryId: null,
                    transferGroup: 'grp-1',
                    transferDirection: 'IN',
                    transferPeerAccountId: 1,
                },
            ],
            taxProfiles: [{id: 40, year: 2026, residenceCountry: 'CA', residenceRegion: 'QC', currency: 'CAD'}],
        }))

        expect(result.ok).toBe(true)
        expect(result.warnings).toEqual([])
        expect(result.counts).toMatchObject({accounts: 2, categories: 1, budgetTargets: 1, recurringTemplates: 1, transactions: 2, taxProfiles: 1})
    })

    it('reports duplicate ids, empty names, invalid amounts and date inconsistencies', () => {
        const result = validateBackupSnapshot(snapshot({
            accounts: [
                {id: 1, name: 'Main', type: 'BANK', currency: '', description: null, openedAt: '2026-05-01', closedAt: '2026-04-01'},
                {id: 1, name: '', type: 'BANK', currency: 'CAD', description: null},
            ],
            categories: [
                {id: 10, name: '', kind: 'EXPENSE', color: null, description: null},
                {id: 10, name: 'Duplicate', kind: 'INCOME', color: null, description: null},
            ],
            budgetTargets: [{
                id: 20,
                name: '',
                amount: 0,
                period: 'MONTHLY',
                startDate: '2026-04-01',
                endDate: null,
                currency: 'CAD',
                isActive: true,
                note: null,
                categoryId: 999,
            }],
            recurringTemplates: [{
                id: 30,
                label: '',
                sourceAmount: 0,
                sourceCurrency: 'CAD',
                accountAmount: null,
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                kind: 'EXPENSE',
                note: null,
                frequency: 'MONTHLY',
                intervalCount: 1,
                startDate: '2026-04-01',
                nextOccurrenceDate: '2026-05-01',
                endDate: null,
                isActive: true,
                accountId: 999,
                categoryId: 999,
            }],
            taxProfiles: [{id: 40, year: 1800, residenceCountry: '', residenceRegion: null, currency: ''}],
        }))

        expect(result.ok).toBe(false)
        expect(result.warnings.join('\n')).toContain('identifiant dupliqué')
        expect(result.warnings.join('\n')).toContain('nom vide')
        expect(result.warnings.join('\n')).toContain('sans devise')
        expect(result.warnings.join('\n')).toContain('fermeture précède')
        expect(result.warnings.join('\n')).toContain('montant non positif')
        expect(result.warnings.join('\n')).toContain('année invalide')
    })

    it('reports transaction and transfer consistency warnings', () => {
        const result = validateBackupSnapshot(snapshot({
            transactions: [
                {
                    id: 100,
                    label: '',
                    amount: 0,
                    sourceAmount: 0,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 999,
                    categoryId: 10,
                    transferGroup: 'broken-count',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 999,
                },
                {
                    id: 101,
                    label: 'A',
                    amount: 10,
                    sourceAmount: 10,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'wrong-directions',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 2,
                },
                {
                    id: 102,
                    label: 'B',
                    amount: 10,
                    sourceAmount: 10,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 2,
                    categoryId: null,
                    transferGroup: 'wrong-directions',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 1,
                },
                {
                    id: 103,
                    label: 'C',
                    amount: 10,
                    sourceAmount: 10,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'incoherent',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 1,
                },
                {
                    id: 104,
                    label: 'D',
                    amount: 10,
                    sourceAmount: 10,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'TRANSFER',
                    date: '2026-04-10',
                    note: null,
                    accountId: 2,
                    categoryId: null,
                    transferGroup: 'incoherent',
                    transferDirection: 'IN',
                    transferPeerAccountId: 2,
                },
            ],
        }))

        expect(result.ok).toBe(false)
        expect(result.warnings.join('\n')).toContain('compte manquant')
        expect(result.warnings.join('\n')).toContain('catégorie')
        expect(result.warnings.join('\n')).toContain('exactement deux jambes')
        expect(result.warnings.join('\n')).toContain('OUT et une jambe IN')
        expect(result.warnings.join('\n')).toContain('incohérent')
    })
})
