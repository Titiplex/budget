import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useJsonBackup} from '../../composables/useJsonBackup'
import type {BudgetBackupSnapshot} from '../../types/budget'
import {i18n} from '../../i18n'

function validSnapshot(): BudgetBackupSnapshot {
    return {
        kind: 'budget-backup',
        version: 4,
        exportedAt: '2026-04-20T12:00:00.000Z',
        data: {
            accounts: [
                {
                    id: 1,
                    name: 'Main',
                    type: 'BANK',
                    currency: 'CAD',
                    description: 'Primary account',
                    institutionCountry: 'CA',
                    institutionRegion: 'QC',
                    taxReportingType: 'BANK',
                    openedAt: '2025-01-01T00:00:00.000Z',
                    closedAt: null,
                },
                {
                    id: 2,
                    name: 'Savings',
                    type: 'SAVINGS',
                    currency: 'CAD',
                    description: null,
                    institutionCountry: null,
                    institutionRegion: null,
                    taxReportingType: 'STANDARD',
                    openedAt: null,
                    closedAt: null,
                },
            ],
            categories: [
                {id: 10, name: 'Groceries', kind: 'EXPENSE', color: '#22c55e', description: null},
                {id: 11, name: 'Salary', kind: 'INCOME', color: null, description: 'Work income'},
            ],
            budgetTargets: [
                {
                    id: 20,
                    name: 'Food budget',
                    amount: 500,
                    period: 'MONTHLY',
                    startDate: '2026-04-01',
                    endDate: null,
                    currency: 'CAD',
                    isActive: true,
                    note: 'Monthly food cap',
                    categoryId: 10,
                },
            ],
            recurringTemplates: [
                {
                    id: 30,
                    label: 'Rent',
                    sourceAmount: 1200,
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
                    accountId: 1,
                    categoryId: 10,
                },
            ],
            transactions: [
                {
                    id: 100,
                    label: 'Groceries',
                    amount: 42,
                    sourceAmount: 42,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-02',
                    kind: 'EXPENSE',
                    date: '2026-04-02',
                    note: 'Weekly shop',
                    taxCategory: 'OTHER',
                    taxSourceCountry: 'CA',
                    taxSourceRegion: 'QC',
                    taxTreatment: 'NOT_TAXABLE',
                    taxWithheldAmount: 0,
                    taxWithheldCurrency: 'CAD',
                    taxWithheldCountry: 'CA',
                    taxDocumentRef: 'receipt-100',
                    accountId: 1,
                    categoryId: 10,
                    transferGroup: null,
                    transferDirection: null,
                    transferPeerAccountId: null,
                },
                {
                    id: 101,
                    label: 'Move to savings',
                    amount: 100,
                    sourceAmount: 100,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-04-03',
                    kind: 'TRANSFER',
                    date: '2026-04-03',
                    note: 'Monthly save',
                    taxCategory: null,
                    taxSourceCountry: null,
                    taxSourceRegion: null,
                    taxTreatment: 'UNKNOWN',
                    taxWithheldAmount: null,
                    taxWithheldCurrency: null,
                    taxWithheldCountry: null,
                    taxDocumentRef: null,
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'transfer-1',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 2,
                },
                {
                    id: 102,
                    label: 'Move to savings',
                    amount: 100,
                    sourceAmount: 100,
                    sourceCurrency: 'CAD',
                    conversionMode: 'MANUAL',
                    exchangeRate: 1,
                    exchangeProvider: 'Manual',
                    exchangeDate: '2026-04-03',
                    kind: 'TRANSFER',
                    date: '2026-04-03',
                    note: 'Monthly save',
                    taxCategory: null,
                    taxSourceCountry: null,
                    taxSourceRegion: null,
                    taxTreatment: 'UNKNOWN',
                    taxWithheldAmount: null,
                    taxWithheldCurrency: null,
                    taxWithheldCountry: null,
                    taxDocumentRef: null,
                    accountId: 2,
                    categoryId: null,
                    transferGroup: 'transfer-1',
                    transferDirection: 'IN',
                    transferPeerAccountId: 1,
                },
            ],
            taxProfiles: [
                {id: 40, year: 2026, residenceCountry: 'CA', residenceRegion: 'QC', currency: 'CAD'},
            ],
        },
    }
}

function installBridgeMocks() {
    let accountId = 100
    let categoryId = 200
    let transactionId = 300

    ;(window as any).file = {
        saveText: vi.fn().mockResolvedValue({canceled: false}),
        openText: vi.fn(),
    }

    ;(window as any).db = {
        transaction: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockImplementation(async (payload) => ({id: ++transactionId, ...payload})),
        },
        recurringTemplate: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 501}),
        },
        budgetTarget: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 601}),
        },
        category: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockImplementation(async (payload) => ({id: ++categoryId, ...payload})),
        },
        account: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockImplementation(async (payload) => ({id: ++accountId, ...payload})),
        },
        taxProfile: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 701}),
        },
        taxMetadata: {
            updateAccount: vi.fn().mockResolvedValue(undefined),
            updateTransaction: vi.fn().mockResolvedValue(undefined),
        },
    }
}

function createHarness() {
    const refreshAllData = vi.fn().mockResolvedValue(undefined)
    const showNotice = vi.fn()

    const backup = useJsonBackup({
        accounts: ref([
            {id: 901, name: 'Old account', type: 'BANK', currency: 'CAD', description: null},
        ] as any),
        categories: ref([
            {id: 902, name: 'Old category', kind: 'EXPENSE', color: null, description: null},
        ] as any),
        budgetTargets: ref([
            {id: 903, name: 'Old budget', amount: 10, period: 'MONTHLY', startDate: '2026-01-01', endDate: null, currency: 'CAD', isActive: true, note: null, categoryId: 902},
        ] as any),
        recurringTemplates: ref([
            {id: 904, label: 'Old recurring', sourceAmount: 10, sourceCurrency: 'CAD', accountAmount: null, conversionMode: 'NONE', exchangeRate: 1, exchangeProvider: 'ACCOUNT', kind: 'EXPENSE', note: null, frequency: 'MONTHLY', intervalCount: 1, startDate: '2026-01-01', nextOccurrenceDate: '2026-02-01', endDate: null, isActive: true, accountId: 901, categoryId: 902},
        ] as any),
        transactions: ref([
            {id: 905, label: 'Old transaction', amount: 10, sourceAmount: 10, sourceCurrency: 'CAD', conversionMode: 'NONE', exchangeRate: 1, exchangeProvider: 'ACCOUNT', exchangeDate: '2026-01-01', kind: 'EXPENSE', date: '2026-01-01', note: null, accountId: 901, categoryId: 902},
        ] as any),
        taxProfiles: ref([
            {id: 906, year: 2025, residenceCountry: 'CA', residenceRegion: 'QC', currency: 'CAD'},
        ] as any),
        refreshAllData,
        showNotice,
    })

    return {backup, refreshAllData, showNotice}
}

describe('useJsonBackup restore flows', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'en'
        installBridgeMocks()
    })

    it('does not show a success notice when JSON export is canceled', async () => {
        ;(window as any).file.saveText.mockResolvedValueOnce({canceled: true})
        const {backup, showNotice} = createHarness()

        await backup.exportBackupJson()

        expect((window as any).file.saveText).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'budget-backup.json',
            filters: [{name: 'JSON', extensions: ['json']}],
        }))
        expect(showNotice).not.toHaveBeenCalled()
    })

    it('ignores canceled restore files and reports invalid JSON content', async () => {
        const {backup, showNotice} = createHarness()

        ;(window as any).file.openText.mockResolvedValueOnce({canceled: true})
        await backup.beginRestoreBackupJson()
        expect(backup.restorePreviewOpen.value).toBe(false)

        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/broken.json',
            content: '{not-json',
        })
        await backup.beginRestoreBackupJson()

        expect(backup.restorePreviewOpen.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('error', expect.stringContaining('JSON'))
    })

    it('opens and closes a valid restore preview', async () => {
        const {backup} = createHarness()
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/budget-backup.json',
            content: JSON.stringify(validSnapshot()),
        })

        await backup.beginRestoreBackupJson()

        expect(backup.restorePreviewOpen.value).toBe(true)
        expect(backup.restorePreviewPath.value).toBe('/tmp/budget-backup.json')
        expect(backup.restorePreviewValidation.value?.ok).toBe(true)
        expect(backup.restorePreviewValidation.value?.counts.accounts).toBe(2)
        expect(backup.restorePreviewValidation.value?.counts.taxProfiles).toBe(1)

        backup.closeRestorePreview()

        expect(backup.restorePreviewOpen.value).toBe(false)
        expect(backup.restorePreviewPath.value).toBeNull()
        expect(backup.restorePreviewValidation.value).toBeNull()
    })

    it('replaces existing data and restores all supported backup entities', async () => {
        const {backup, refreshAllData, showNotice} = createHarness()
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/budget-backup.json',
            content: JSON.stringify(validSnapshot()),
        })

        await backup.beginRestoreBackupJson()
        await backup.confirmRestoreBackupJson()

        expect((window as any).db.transaction.delete).toHaveBeenCalledWith(905)
        expect((window as any).db.recurringTemplate.delete).toHaveBeenCalledWith(904)
        expect((window as any).db.budgetTarget.delete).toHaveBeenCalledWith(903)
        expect((window as any).db.category.delete).toHaveBeenCalledWith(902)
        expect((window as any).db.account.delete).toHaveBeenCalledWith(901)
        expect((window as any).db.taxProfile.delete).toHaveBeenCalledWith(906)

        expect((window as any).db.account.create).toHaveBeenNthCalledWith(1, {
            name: 'Main',
            type: 'BANK',
            currency: 'CAD',
            description: 'Primary account',
        })
        expect((window as any).db.taxMetadata.updateAccount).toHaveBeenNthCalledWith(1, 101, {
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            taxReportingType: 'BANK',
            openedAt: '2025-01-01T00:00:00.000Z',
            closedAt: null,
        })
        expect((window as any).db.category.create).toHaveBeenNthCalledWith(1, {
            name: 'Groceries',
            kind: 'EXPENSE',
            color: '#22c55e',
            description: null,
        })
        expect((window as any).db.taxProfile.create).toHaveBeenCalledWith({
            year: 2026,
            residenceCountry: 'CA',
            residenceRegion: 'QC',
            currency: 'CAD',
        })
        expect((window as any).db.budgetTarget.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Food budget',
            categoryId: 201,
        }))
        expect((window as any).db.recurringTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Rent',
            accountId: 101,
            categoryId: 201,
        }))

        expect((window as any).db.transaction.create).toHaveBeenCalledTimes(2)
        expect((window as any).db.transaction.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
            label: 'Groceries',
            amount: 42,
            sourceAmount: 42,
            kind: 'EXPENSE',
            accountId: 101,
            categoryId: 201,
        }))
        expect((window as any).db.transaction.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
            label: 'Move to savings',
            amount: 100,
            sourceAmount: 100,
            conversionMode: 'MANUAL',
            exchangeProvider: 'Manual',
            kind: 'TRANSFER',
            accountId: 101,
            categoryId: null,
            transferTargetAccountId: 102,
        }))
        expect((window as any).db.taxMetadata.updateTransaction).toHaveBeenNthCalledWith(1, 301, expect.objectContaining({
            taxCategory: 'OTHER',
            taxTreatment: 'NOT_TAXABLE',
            taxDocumentRef: 'receipt-100',
        }))
        expect((window as any).db.taxMetadata.updateTransaction).toHaveBeenNthCalledWith(2, 302, expect.objectContaining({
            taxCategory: null,
            taxTreatment: 'UNKNOWN',
        }))
        expect(refreshAllData).toHaveBeenCalledTimes(1)
        expect(backup.restorePreviewOpen.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('reports restore failures without closing the preview', async () => {
        const {backup, refreshAllData, showNotice} = createHarness()
        ;(window as any).db.account.create.mockRejectedValueOnce(new Error('create failed'))
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/budget-backup.json',
            content: JSON.stringify(validSnapshot()),
        })

        await backup.beginRestoreBackupJson()
        await backup.confirmRestoreBackupJson()

        expect(refreshAllData).not.toHaveBeenCalled()
        expect(backup.restorePreviewOpen.value).toBe(true)
        expect(showNotice).toHaveBeenCalledWith('error', 'create failed')
    })

    it('does nothing when restore is confirmed without a preview snapshot', async () => {
        const {backup, refreshAllData, showNotice} = createHarness()

        await backup.confirmRestoreBackupJson()

        expect((window as any).db.account.create).not.toHaveBeenCalled()
        expect(refreshAllData).not.toHaveBeenCalled()
        expect(showNotice).not.toHaveBeenCalled()
    })
})
