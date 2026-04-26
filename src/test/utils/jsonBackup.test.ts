import {describe, expect, it} from 'vitest'
import {
    BUDGET_BACKUP_FORMAT_VERSION,
    createBudgetBackupSnapshot,
    parseBudgetBackup,
    serializeBudgetBackup,
} from '../../utils/jsonBackup'

function validBackup(version = BUDGET_BACKUP_FORMAT_VERSION) {
    return {
        kind: 'budget-backup',
        version,
        exportedAt: '2026-04-24T10:00:00.000Z',
        data: {
            accounts: [
                {
                    id: 1,
                    name: 'Main',
                    type: 'BANK',
                    currency: 'CAD',
                    description: null,
                    institutionCountry: 'CA',
                    institutionRegion: 'QC',
                    taxReportingType: 'BANK',
                    openedAt: null,
                    closedAt: null,
                },
                {
                    id: 2,
                    name: 'Savings',
                    type: 'SAVINGS',
                    currency: 'CAD',
                    description: null,
                    institutionCountry: 'CA',
                    institutionRegion: 'QC',
                    taxReportingType: 'BANK',
                    openedAt: null,
                    closedAt: null,
                },
            ],
            categories: [
                {id: 10, name: 'Groceries', kind: 'EXPENSE', color: '#000000', description: null},
            ],
            budgetTargets: [
                {
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
                },
            ],
            recurringTemplates: [],
            transactions: [
                {
                    id: 100,
                    label: 'Groceries',
                    amount: 25,
                    sourceAmount: 25,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-10',
                    kind: 'EXPENSE',
                    date: '2026-04-10',
                    note: null,
                    taxCategory: null,
                    taxSourceCountry: null,
                    taxSourceRegion: null,
                    taxTreatment: 'UNKNOWN',
                    taxWithheldAmount: null,
                    taxWithheldCurrency: null,
                    taxWithheldCountry: null,
                    taxDocumentRef: null,
                    accountId: 1,
                    categoryId: 10,
                    transferGroup: null,
                    transferDirection: null,
                    transferPeerAccountId: null,
                },
                {
                    id: 101,
                    label: 'Move to savings',
                    amount: 50,
                    sourceAmount: 50,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-11',
                    kind: 'TRANSFER',
                    date: '2026-04-11',
                    note: null,
                    taxCategory: 'TRANSFER',
                    taxSourceCountry: 'CA',
                    taxSourceRegion: 'QC',
                    taxTreatment: 'NOT_TAXABLE',
                    taxWithheldAmount: null,
                    taxWithheldCurrency: null,
                    taxWithheldCountry: null,
                    taxDocumentRef: 'transfer-note',
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'grp-1',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 2,
                },
                {
                    id: 102,
                    label: 'Move to savings',
                    amount: 50,
                    sourceAmount: 50,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-11',
                    kind: 'TRANSFER',
                    date: '2026-04-11',
                    note: null,
                    taxCategory: 'TRANSFER',
                    taxSourceCountry: 'CA',
                    taxSourceRegion: 'QC',
                    taxTreatment: 'NOT_TAXABLE',
                    taxWithheldAmount: null,
                    taxWithheldCurrency: null,
                    taxWithheldCountry: null,
                    taxDocumentRef: 'transfer-note',
                    accountId: 2,
                    categoryId: null,
                    transferGroup: 'grp-1',
                    transferDirection: 'IN',
                    transferPeerAccountId: 1,
                },
            ],
            taxProfiles: [
                {
                    id: 200,
                    year: 2026,
                    residenceCountry: 'CA',
                    residenceRegion: 'QC',
                    currency: 'CAD',
                },
            ],
        },
    }
}

describe('jsonBackup format', () => {
    it('parses and serializes the current explicit backup version', () => {
        const parsed = parseBudgetBackup(JSON.stringify(validBackup()))
        const serialized = serializeBudgetBackup(parsed)

        expect(parsed.version).toBe(BUDGET_BACKUP_FORMAT_VERSION)
        expect(parsed.data.accounts).toHaveLength(2)
        expect(parsed.data.taxProfiles).toHaveLength(1)
        expect(serialized).toContain('"kind": "budget-backup"')
        expect(serialized).toContain('"version": 4')
    })

    it('normalizes a supported legacy version without tax metadata', () => {
        const legacy = validBackup(2)
        delete (legacy.data as any).taxProfiles
        delete (legacy.data.accounts[0] as any).institutionCountry
        delete (legacy.data.accounts[0] as any).institutionRegion
        delete (legacy.data.accounts[0] as any).taxReportingType
        delete (legacy.data.accounts[0] as any).openedAt
        delete (legacy.data.accounts[0] as any).closedAt
        delete (legacy.data.transactions[0] as any).taxCategory
        delete (legacy.data.transactions[0] as any).taxSourceCountry
        delete (legacy.data.transactions[0] as any).taxSourceRegion
        delete (legacy.data.transactions[0] as any).taxTreatment
        delete (legacy.data.transactions[0] as any).taxWithheldAmount
        delete (legacy.data.transactions[0] as any).taxWithheldCurrency
        delete (legacy.data.transactions[0] as any).taxWithheldCountry
        delete (legacy.data.transactions[0] as any).taxDocumentRef

        const parsed = parseBudgetBackup(JSON.stringify(legacy))

        expect(parsed.version).toBe(2)
        expect(parsed.data.taxProfiles).toEqual([])
        expect(parsed.data.accounts[0].taxReportingType).toBe('STANDARD')
        expect(parsed.data.transactions[0].taxTreatment).toBe('UNKNOWN')
    })

    it('creates and parses a valid v4 snapshot with backup helper', () => {
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
            [],
            [],
            [{
                id: 3,
                label: 'Groceries',
                amount: 42,
                sourceAmount: 42,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-20',
                kind: 'EXPENSE',
                date: '2026-04-20',
                note: null,
                taxCategory: 'OTHER',
                taxSourceCountry: 'CA',
                taxSourceRegion: 'QC',
                taxTreatment: 'TAXABLE_NO_WITHHOLDING',
                taxWithheldAmount: null,
                taxWithheldCurrency: null,
                taxWithheldCountry: null,
                taxDocumentRef: 'receipt-123',
                accountId: 1,
                categoryId: 2,
                transferGroup: null,
                transferDirection: null,
                transferPeerAccountId: null,
            }],
            [{
                id: 50,
                year: 2026,
                residenceCountry: 'CA',
                residenceRegion: 'QC',
                currency: 'CAD',
            }],
        )

        const parsed = parseBudgetBackup(serializeBudgetBackup(snapshot))

        expect(parsed.kind).toBe('budget-backup')
        expect(parsed.version).toBe(4)
        expect(parsed.data.accounts[0].institutionCountry).toBe('CA')
        expect(parsed.data.transactions[0].taxTreatment).toBe('TAXABLE_NO_WITHHOLDING')
        expect(parsed.data.transactions[0].taxDocumentRef).toBe('receipt-123')
        expect(parsed.data.taxProfiles?.[0].residenceRegion).toBe('QC')
    })

    it('rejects a corrupted structure before restore', () => {
        const corrupted = validBackup()
        delete (corrupted.data.transactions[0] as any).accountId

        expect(() => parseBudgetBackup(JSON.stringify(corrupted)))
            .toThrow('data.transactions[0].accountId')
    })

    it('rejects dangling references before restore', () => {
        const dangling = validBackup()
        dangling.data.budgetTargets[0].categoryId = 999

        expect(() => parseBudgetBackup(JSON.stringify(dangling)))
            .toThrow('catégorie absente')
    })

    it('rejects unsupported backup versions clearly', () => {
        const unsupported = validBackup(99)

        expect(() => parseBudgetBackup(JSON.stringify(unsupported)))
            .toThrow('Version de backup JSON non supportée')
    })

    it('rejects incomplete transfer groups', () => {
        const corrupted = validBackup()
        corrupted.data.transactions = corrupted.data.transactions.filter((transaction) => transaction.id !== 102)

        expect(() => parseBudgetBackup(JSON.stringify(corrupted)))
            .toThrow('exactement deux jambes')
    })
})
