import {describe, expect, it} from 'vitest'
import {createBudgetBackupSnapshot, parseBudgetBackup, serializeBudgetBackup} from '../../utils/jsonBackup'

describe('json backup utils', () => {
    it('creates and parses a valid v4 snapshot with budgets, recurring templates, transfer metadata and tax metadata', () => {
        const snapshot = createBudgetBackupSnapshot(
            [{
                id: 1,
                name: 'Main',
                type: 'BANK',
                currency: 'CAD',
                description: null,
                institutionCountry: 'CA',
                institutionRegion: 'QC',
                taxReportingType: 'BANK',
                openedAt: '2026-01-01T00:00:00.000Z',
                closedAt: null,
            }],
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
                label: 'Move to savings',
                amount: 42,
                sourceAmount: 42,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-20T00:00:00.000Z',
                kind: 'TRANSFER',
                date: '2026-04-20T00:00:00.000Z',
                note: null,
                taxCategory: 'TRANSFER',
                taxSourceCountry: 'CA',
                taxSourceRegion: 'QC',
                taxTreatment: 'NOT_TAXABLE',
                taxWithheldAmount: null,
                taxWithheldCurrency: null,
                taxWithheldCountry: null,
                taxDocumentRef: 'internal-transfer-note',
                accountId: 1,
                categoryId: null,
                transferGroup: 'grp-1',
                transferDirection: 'OUT',
                transferPeerAccountId: 99,
            }],
            [{
                id: 50,
                year: 2026,
                residenceCountry: 'CA',
                residenceRegion: 'QC',
                currency: 'CAD',
            }],
        )

        const serialized = serializeBudgetBackup(snapshot)
        const parsed = parseBudgetBackup(serialized)

        expect(parsed.kind).toBe('budget-backup')
        expect(parsed.version).toBe(4)
        expect(parsed.data.accounts).toHaveLength(1)
        expect(parsed.data.accounts[0].institutionCountry).toBe('CA')
        expect(parsed.data.accounts[0].institutionRegion).toBe('QC')
        expect(parsed.data.accounts[0].taxReportingType).toBe('BANK')
        expect(parsed.data.categories).toHaveLength(1)
        expect(parsed.data.budgetTargets).toHaveLength(1)
        expect(parsed.data.recurringTemplates).toHaveLength(1)
        expect(parsed.data.transactions).toHaveLength(1)
        expect(parsed.data.transactions[0].transferGroup).toBe('grp-1')
        expect(parsed.data.transactions[0].transferDirection).toBe('OUT')
        expect(parsed.data.transactions[0].transferPeerAccountId).toBe(99)
        expect(parsed.data.transactions[0].taxTreatment).toBe('NOT_TAXABLE')
        expect(parsed.data.transactions[0].taxDocumentRef).toBe('internal-transfer-note')
        expect(parsed.data.taxProfiles).toHaveLength(1)
        expect(parsed.data.taxProfiles?.[0].residenceRegion).toBe('QC')
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

    it('accepts legacy version 3 snapshots', () => {
        const parsed = parseBudgetBackup(JSON.stringify({
            kind: 'budget-backup',
            version: 3,
            exportedAt: '2026-04-20T00:00:00.000Z',
            data: {
                accounts: [],
                categories: [],
                budgetTargets: [],
                recurringTemplates: [],
                transactions: [],
            },
        }))

        expect(parsed.version).toBe(3)
    })

    it('rejects invalid snapshot', () => {
        expect(() => parseBudgetBackup('{"kind":"wrong"}')).toThrow()
    })
})
