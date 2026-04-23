import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useReports} from '../../composables/useReports'

describe('useReports empty period', () => {
    beforeEach(() => {
        ;(window as any).file = {
            saveText: vi.fn().mockResolvedValue({canceled: false}),
        }
    })

    it('keeps all summary metrics at zero and can export a report', async () => {
        const showNotice = vi.fn()

        const reports = useReports({
            accounts: ref([] as any),
            categories: ref([] as any),
            transactions: ref([] as any),
            showNotice,
        })

        reports.applyPreset('ALL')

        expect(reports.filteredTransactions.value).toHaveLength(0)
        expect(reports.reportSummary.value.transactionCount).toBe(0)
        expect(reports.reportSummary.value.income).toBe(0)
        expect(reports.reportSummary.value.expense).toBe(0)
        expect(reports.reportSummary.value.net).toBe(0)
        expect(reports.reportSummary.value.internalTransferCount).toBe(0)
        expect(reports.reportComparison.value.income.delta).toBe(0)
        expect(reports.reportComparison.value.expense.delta).toBe(0)
        expect(reports.reportComparison.value.net.delta).toBe(0)

        await reports.exportPeriodReport()

        expect(window.file.saveText).toHaveBeenCalled()
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })
})