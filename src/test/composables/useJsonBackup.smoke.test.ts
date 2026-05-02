import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useJsonBackup} from '../../composables/useJsonBackup'

describe('useJsonBackup smoke', () => {
    const saveTextMock = vi.fn()
    const openTextMock = vi.fn()

    const deleteTransactionMock = vi.fn()
    const createTransactionMock = vi.fn()
    const deleteRecurringMock = vi.fn()
    const createRecurringMock = vi.fn()
    const deleteBudgetMock = vi.fn()
    const createBudgetMock = vi.fn()
    const deleteCategoryMock = vi.fn()
    const createCategoryMock = vi.fn()
    const deleteAccountMock = vi.fn()
    const createAccountMock = vi.fn()

    beforeEach(() => {
        saveTextMock.mockReset()
        openTextMock.mockReset()

        deleteTransactionMock.mockReset()
        createTransactionMock.mockReset()
        deleteRecurringMock.mockReset()
        createRecurringMock.mockReset()
        deleteBudgetMock.mockReset()
        createBudgetMock.mockReset()
        deleteCategoryMock.mockReset()
        createCategoryMock.mockReset()
        deleteAccountMock.mockReset()
        createAccountMock.mockReset()

        saveTextMock.mockResolvedValue({canceled: false})

        ;(window as any).file = {
            saveText: saveTextMock,
            openText: openTextMock,
        }

        ;(window as any).db = {
            transaction: {delete: deleteTransactionMock, create: createTransactionMock},
            recurringTemplate: {delete: deleteRecurringMock, create: createRecurringMock},
            budgetTarget: {delete: deleteBudgetMock, create: createBudgetMock},
            category: {delete: deleteCategoryMock, create: createCategoryMock},
            account: {delete: deleteAccountMock, create: createAccountMock},
        }
    })

    it('exports a version 5 backup and opens a valid restore preview', async () => {
        const accounts = ref([
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
        ] as any)

        const categories = ref([
            {id: 10, name: 'Groceries', kind: 'EXPENSE', color: '#000', description: null},
        ] as any)

        const budgetTargets = ref([] as any)
        const recurringTemplates = ref([] as any)

        const transactions = ref([
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
        ] as any)

        const showNotice = vi.fn()

        const backup = useJsonBackup({
            accounts,
            categories,
            budgetTargets,
            recurringTemplates,
            transactions,
            refreshAllData: vi.fn(),
            showNotice,
        })

        await backup.exportBackupJson()

        expect(saveTextMock).toHaveBeenCalled()

        const exportedContent = saveTextMock.mock.calls[0][0].content
        expect(exportedContent).toContain('"kind": "budget-backup"')
        expect(exportedContent).toContain('"version": 5')
        expect(exportedContent).toContain('"institutionCountry": "CA"')
        expect(exportedContent).toContain('"taxProfiles": []')
        expect(exportedContent).toContain('"financialGoals": []')
        expect(exportedContent).toContain('"projectionScenarios": []')
        expect(exportedContent).toContain('"projectionSettings": null')

        openTextMock.mockResolvedValue({
            canceled: false,
            filePath: '/tmp/budget-backup.json',
            content: exportedContent,
        })

        await backup.beginRestoreBackupJson()

        expect(backup.restorePreviewOpen.value).toBe(true)
        expect(backup.restorePreviewPath.value).toBe('/tmp/budget-backup.json')
        expect(backup.restorePreviewValidation.value?.ok).toBe(true)
        expect(backup.restorePreviewValidation.value?.counts.accounts).toBe(1)
        expect(backup.restorePreviewValidation.value?.counts.transactions).toBe(1)
    })
})
