import {mount} from '@vue/test-utils'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import ImportHistorySection from '../../components/ImportHistorySection.vue'

function ok<T>(data: T) {
    return {ok: true, data, error: null}
}

const historyItems = [
    {
        id: 'batch-1',
        status: 'applied',
        importType: 'transactions',
        source: 'bank-a',
        provider: 'bank-a',
        fileName: 'bank-a.csv',
        rowCount: 2,
        appliedRowCount: 1,
        errorCount: 1,
        warningCount: 1,
        duplicateCount: 1,
        decisionCount: 1,
        importedAt: '2026-05-01T10:00:00.000Z',
    },
]

const detail = {
    ...historyItems[0],
    rawRows: [{rowNumber: 2, rawText: '2026-05-01,Coffee,-4.50,CAD', status: 'normalized'}],
    normalizedRows: [{id: 'row-1', rowNumber: 2, status: 'valid', normalizedData: {date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD'}, validationErrors: []}],
    errors: [{rowNumber: 3, severity: 'error', code: 'invalidDate', message: 'Date invalide', field: 'date'}],
    warnings: [{rowNumber: 2, severity: 'warning', code: 'missingLabel', message: 'Libellé manquant', field: 'label'}],
    duplicateCandidates: [{normalizedRowId: 'row-1', confidence: 0.99, reason: 'Same hash', entityId: 42}],
    decisions: [{id: 'decision-1', rowNumber: 2, normalizedRowId: 'row-1', kind: 'importAsNew', status: 'applied', reason: 'Transaction prête', reasonSource: 'automatic', history: [{status: 'applied'}]}],
    appliedLinks: [{normalizedRowId: 'row-1', entityType: 'transaction', operation: 'created', transactionId: 'tx-1', appliedAt: '2026-05-01T10:00:03.000Z'}],
}

function mockWindowApis() {
    Object.defineProperty(window, 'imports', {
        configurable: true,
        value: {
            listHistory: vi.fn().mockResolvedValue(ok(historyItems)),
            listSources: vi.fn().mockResolvedValue(ok(['bank-a'])),
            getDetail: vi.fn().mockResolvedValue(ok(detail)),
            exportReport: vi.fn().mockResolvedValue(ok({fileName: 'report.md', content: '# Rapport'})),
            deleteHistory: vi.fn().mockResolvedValue(ok({ok: true, batchId: 'batch-1', deletedHistory: true, preservedFinancialData: true, removedAppliedLinksFromHistory: 1})),
        },
    })
    Object.defineProperty(window, 'file', {
        configurable: true,
        value: {
            saveText: vi.fn().mockResolvedValue({canceled: false, filePath: '/tmp/report.md'}),
        },
    })
}

describe('ImportHistorySection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockWindowApis()
    })

    it('loads and filters import history', async () => {
        const wrapper = mount(ImportHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(window.imports.listHistory).toHaveBeenCalledWith(expect.objectContaining({}))
        expect(wrapper.text()).toContain('Historique d’import')
        expect(wrapper.text()).toContain('bank-a.csv')
        expect(wrapper.text()).toContain('1 appliquées')

        await wrapper.find('select.form-input').setValue('applied')
        const applyFiltersButton = wrapper.findAll('button').find((button) => button.text().includes('Appliquer les filtres'))
        await applyFiltersButton!.trigger('click')

        expect(window.imports.listHistory).toHaveBeenLastCalledWith(expect.objectContaining({status: 'applied'}))
        wrapper.unmount()
    })

    it('shows detail tabs with errors, decisions and applied links', async () => {
        const wrapper = mount(ImportHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        await wrapper.find('tbody tr').trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(window.imports.getDetail).toHaveBeenCalledWith('batch-1')
        expect(wrapper.text()).toContain('bank-a.csv')
        expect(wrapper.text()).toContain('Export MD')

        const messagesTab = wrapper.findAll('button').find((button) => button.text() === 'messages')
        await messagesTab!.trigger('click')
        expect(wrapper.text()).toContain('Date invalide')
        expect(wrapper.text()).toContain('Libellé manquant')

        const decisionsTab = wrapper.findAll('button').find((button) => button.text() === 'decisions')
        await decisionsTab!.trigger('click')
        expect(wrapper.text()).toContain('importAsNew')

        const linksTab = wrapper.findAll('button').find((button) => button.text() === 'links')
        await linksTab!.trigger('click')
        expect(wrapper.text()).toContain('created')
        expect(wrapper.text()).toContain('tx-1')
        wrapper.unmount()
    })

    it('exports reports and deletes only history after explicit batch id confirmation', async () => {
        const wrapper = mount(ImportHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()
        await wrapper.find('tbody tr').trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        const exportButton = wrapper.findAll('button').find((button) => button.text() === 'Export MD')
        await exportButton!.trigger('click')
        await vi.dynamicImportSettled()
        expect(window.imports.exportReport).toHaveBeenCalledWith('batch-1', {format: 'markdown'})
        expect(window.file.saveText).toHaveBeenCalledWith(expect.objectContaining({defaultPath: 'report.md', content: '# Rapport'}))

        const deleteButtonBefore = wrapper.findAll('button').find((button) => button.text().includes('Supprimer l’historique'))
        expect(deleteButtonBefore?.attributes('disabled')).toBeDefined()

        const confirmationInputs = wrapper.findAll('input.form-input')
        await confirmationInputs[confirmationInputs.length - 1].setValue('batch-1')
        const deleteButtonAfter = wrapper.findAll('button').find((button) => button.text().includes('Supprimer l’historique'))
        expect(deleteButtonAfter?.attributes('disabled')).toBeUndefined()
        await deleteButtonAfter!.trigger('click')
        await vi.dynamicImportSettled()

        expect(window.imports.deleteHistory).toHaveBeenCalledWith('batch-1', {preserveFinancialData: true})
        const notices = wrapper.emitted('notice') || []
        expect(notices[notices.length - 1]).toEqual(['success', 'Historique supprimé. Les transactions/assets créés ne sont pas supprimés.'])
        wrapper.unmount()
    })
})
