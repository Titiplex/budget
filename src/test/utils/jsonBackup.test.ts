import {describe, expect, it} from 'vitest'
import {createBudgetBackupSnapshot, parseBudgetBackup, serializeBudgetBackup} from '../../utils/jsonBackup'

describe('json backup utils', () => {
    it('creates and parses a valid snapshot with budgets and recurring templates', () => {
        const snapshot = createBudgetBackupSnapshot(
            [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
            [{id: 2, name: 'Food', kind: 'EXPENSE', color: '#ff00aa', description: null}],
            [{
                id: 10,
                name: 'Budget food',
                amount: 400,
                period: 'MONTHLY',
                startDate: '2026-04-01T00:00:00.000Z',
                endDate: null,
                currency: 'CAD',
                isActive: true,
                note: null,
                categoryId: 2,
            }],
            [{
                id: 20,
                label: 'Spotify',
                sourceAmount: 12,
                sourceCurrency: 'CAD',
                accountAmount: 12,
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                kind: 'EXPENSE',
                note: null,
                frequency: 'MONTHLY',
                intervalCount: 1,
                startDate: '2026-04-01T00:00:00.000Z',
                nextOccurrenceDate: '2026-05-01T00:00:00.000Z',
                endDate: null,
                isActive: true,
                accountId: 1,
                categoryId: 2,
            }],
            [{
                id: 3,
                label: 'Groceries',
                amount: 42,
                sourceAmount: 42,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-20T00:00:00.000Z',
                kind: 'EXPENSE',
                date: '2026-04-20T00:00:00.000Z',
                note: null,
                accountId: 1,
                categoryId: 2,
            }],
        )

        const serialized = serializeBudgetBackup(snapshot)
        const parsed = parseBudgetBackup(serialized)

        expect(parsed.kind).toBe('budget-backup')
        expect(parsed.version).toBe(2)
        expect(parsed.data.accounts).toHaveLength(1)
        expect(parsed.data.categories).toHaveLength(1)
        expect(parsed.data.budgetTargets).toHaveLength(1)
        expect(parsed.data.recurringTemplates).toHaveLength(1)
        expect(parsed.data.transactions).toHaveLength(1)
    })

    it('rejects invalid snapshot', () => {
        expect(() => parseBudgetBackup('{"kind":"wrong"}')).toThrow()
    })
})