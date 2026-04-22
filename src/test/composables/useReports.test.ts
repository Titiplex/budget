import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useReports} from '../../composables/useReports'

describe('useReports', () => {
    beforeEach(() => {
        ;(window as any).file = {
            saveText: vi.fn().mockResolvedValue({canceled: true}),
        }
    })

    it('excludes transfers from income and expense and keeps internal transfer count', () => {
        const accounts = ref([
            {id: 1, name: 'Main', type: 'BANK', currency: 'CAD'},
            {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'},
        ] as any)

        const categories = ref([
            {id: 10, name: 'Side', kind: 'EXPENSE', color: '#000'},
        ] as any)

        const transactions = ref([
            {
                id: 1,
                label: 'Salary',
                amount: 100,
                kind: 'INCOME',
                date: '2026-04-10',
                accountId: 1,
                categoryId: 10,
                account: accounts.value[0],
                category: categories.value[0],
            },
            {
                id: 2,
                label: 'Groceries',
                amount: 40,
                kind: 'EXPENSE',
                date: '2026-04-11',
                accountId: 1,
                categoryId: 10,
                account: accounts.value[0],
                category: categories.value[0],
            },
            {
                id: 3,
                label: 'Move to savings',
                amount: 25,
                kind: 'TRANSFER',
                date: '2026-04-12',
                accountId: 1,
                categoryId: null,
                transferGroup: 'grp-1',
                account: accounts.value[0],
                category: null,
            },
            {
                id: 4,
                label: 'Move to savings',
                amount: 25,
                kind: 'TRANSFER',
                date: '2026-04-12',
                accountId: 2,
                categoryId: null,
                transferGroup: 'grp-1',
                account: accounts.value[1],
                category: null,
            },
        ] as any)

        const reports = useReports({
            accounts,
            categories,
            transactions,
            showNotice: vi.fn(),
        })

        reports.applyPreset('ALL')

        expect(reports.reportSummary.value.income).toBe(100)
        expect(reports.reportSummary.value.expense).toBe(40)
        expect(reports.reportSummary.value.internalTransferCount).toBe(1)

        expect(reports.categoryRows.value[0].kind).toBe('MIXED')
    })
})