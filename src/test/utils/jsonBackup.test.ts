import {describe, expect, it} from 'vitest'
import {createBudgetBackupSnapshot, parseBudgetBackup, serializeBudgetBackup} from '../../utils/jsonBackup'

describe('json backup utils', () => {
    it('creates and parses a valid snapshot with budgets, recurring templates and transfer metadata', () => {
        const snapshot = createBudgetBackupSnapshot(
            [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null}],
            [{id: 2, name: 'Food', kind: 'EXPENSE', color: '#ff00aa', description: null}],
            [{
                id: 10,
                name: 'Budget food',
                amount: 400,
                period: 'MONTHLY',
                startDate: '2026-04-01',
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
                startDate: '2026-04-01',
                nextOccurrenceDate: '2026-05-01',
                endDate: null,
                isActive: true,
                accountId: 1,
                categoryId: 2,
            }],
            [{
                id: 3,
                label: 'Move to savings',
                amount: 42,
                sourceAmount: 42,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-20',
                kind: 'TRANSFER',
                date: '2026-04-20',
                note: null,
                accountId: 1,
                categoryId: null,
                transferGroup: 'grp-1',
                transferDirection: 'OUT',
                transferPeerAccountId: 99,
            }],
        )

        const serialized = serializeBudgetBackup(snapshot)
        const parsed = parseBudgetBackup(serialized)

        expect(parsed.kind).toBe('budget-backup')
        expect(parsed.version).toBe(3)
        expect(parsed.data.accounts).toHaveLength(1)
        expect(parsed.data.categories).toHaveLength(1)
        expect(parsed.data.budgetTargets).toHaveLength(1)
        expect(parsed.data.recurringTemplates).toHaveLength(1)
        expect(parsed.data.transactions).toHaveLength(1)
        expect(parsed.data.transactions[0].transferGroup).toBe('grp-1')
        expect(parsed.data.transactions[0].transferDirection).toBe('OUT')
        expect(parsed.data.transactions[0].transferPeerAccountId).toBe(99)
    })

    it('accepts legacy version 2 snapshots', () => {
        const parsed = parseBudgetBackup(JSON.stringify({
            kind: 'budget-backup',
            version: 2,
            exportedAt: '2026-04-20T00:00:00.000Z',
            data: {
                accounts: [],
                categories: [],
                budgetTargets: [],
                recurringTemplates: [],
                transactions: [],
            },
        }))

        expect(parsed.version).toBe(2)
    })

    it('rejects invalid snapshot', () => {
        expect(() => parseBudgetBackup('{"kind":"wrong"}')).toThrow()
    })
})
