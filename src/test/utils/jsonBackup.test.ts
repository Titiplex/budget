import {describe, expect, it} from 'vitest'
import {createBudgetBackupSnapshot, parseBudgetBackup, serializeBudgetBackup} from '../../utils/jsonBackup'

describe('json backup utils', () => {
    it('creates and parses a valid snapshot', () => {
        const snapshot = createBudgetBackupSnapshot(
            [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
            [{id: 2, name: 'Food', kind: 'EXPENSE', color: '#ff00aa', description: null}],
            [{
                id: 3,
                label: 'Groceries',
                amount: 42,
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
        expect(parsed.data.accounts).toHaveLength(1)
        expect(parsed.data.categories).toHaveLength(1)
        expect(parsed.data.transactions).toHaveLength(1)
    })

    it('rejects invalid snapshot', () => {
        expect(() => parseBudgetBackup('{"kind":"wrong"}')).toThrow()
    })
})