import {mount} from '@vue/test-utils'
import {describe, expect, it, vi, beforeEach} from 'vitest'
import ImportWizardDialog from '../../components/ImportWizardDialog.vue'

const csvFixture = ['Date,Description,Amount,Currency,Account', '2026-05-01,Coffee,-4.50,CAD,Main'].join('\n')

function ok<T>(data: T) {
    return {ok: true, data, error: null}
}

function mockWindowApis() {
    const createBatch = vi.fn().mockResolvedValue(ok({id: 'batch-1', status: 'draft', fileName: 'import.csv'}))
    const parseFile = vi.fn().mockResolvedValue(ok({
        batch: {id: 'batch-1', rowCount: 1, errorCount: 0},
        parsed: {headers: ['Date', 'Description', 'Amount', 'Currency', 'Account'], rawRows: [], normalizedRows: [], errors: []},
    }))
    const preview = vi.fn().mockResolvedValue(ok({
        canApply: true,
        stats: {
            totalRows: 1,
            createTransactionRows: 1,
            updateTransactionRows: 0,
            needsReviewRows: 0,
            errorCount: 0,
            duplicateCount: 0,
        },
        rows: [{
            rowNumber: 2,
            rowId: 'row-2',
            status: 'valid',
            action: 'createTransaction',
            reviewRequired: false,
            reasons: ['Transaction prête à être créée.'],
            missingFields: [],
            warnings: [],
            errors: [],
            duplicateCandidates: [],
            conflicts: [],
            normalizedData: {date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD'},
        }],
    }))
    const apply = vi.fn().mockResolvedValue(ok({
        batch: {status: 'applied', rowCount: 1, errorCount: 0},
        appliedLinks: [{operation: 'created'}],
        decisions: [],
    }))

    Object.defineProperty(window, 'file', {
        configurable: true,
        value: {
            openText: vi.fn().mockResolvedValue({canceled: false, content: csvFixture, filePath: '/tmp/import.csv'}),
        },
    })
    Object.defineProperty(window, 'imports', {
        configurable: true,
        value: {
            createBatch,
            parseFile,
            preview,
            apply,
            cancel: vi.fn().mockResolvedValue(ok({})),
            mappingTemplate: {
                list: vi.fn().mockResolvedValue(ok([])),
                create: vi.fn().mockResolvedValue(ok({id: 'template-1', name: 'Template import.csv'})),
            },
        },
    })

    return {createBatch, parseFile, preview, apply}
}

describe('ImportWizardDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockWindowApis()
    })

    it('guides a CSV import through file, preview and explicit confirmation', async () => {
        const wrapper = mount(ImportWizardDialog, {
            props: {
                open: true,
                accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null, createdAt: '', updatedAt: ''}],
            },
            attachTo: document.body,
        })

        await wrapper.find('button.primary-btn').trigger('click')
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).toContain('Date')
        expect(wrapper.text()).toContain('Parser et prévisualiser')

        const parseButton = wrapper.findAll('button').find((button) => button.text().includes('Parser'))
        expect(parseButton).toBeTruthy()
        await parseButton!.trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(window.imports.createBatch).toHaveBeenCalled()
        expect(window.imports.parseFile).toHaveBeenCalled()
        expect(window.imports.preview).toHaveBeenCalled()
        expect(wrapper.text()).toContain('Créer transaction')
        expect(wrapper.text()).toContain('Transaction prête à être créée.')

        const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('Continuer vers confirmation'))
        await confirmButton!.trigger('click')
        await wrapper.find('input[type="checkbox"]').setValue(true)
        const applyButton = wrapper.findAll('button').find((button) => button.text().includes('Appliquer l’import'))
        await applyButton!.trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(window.imports.apply).toHaveBeenCalledWith({batchId: 'batch-1'})
        expect(wrapper.text()).toContain('Import terminé')
        expect(wrapper.emitted('applied')).toBeTruthy()

        wrapper.unmount()
    })

    it('shows duplicate and review filters instead of hiding risky rows', async () => {
        Object.defineProperty(window, 'imports', {
            configurable: true,
            value: {
                ...window.imports,
                preview: vi.fn().mockResolvedValue(ok({
                    canApply: true,
                    stats: {totalRows: 1, createTransactionRows: 0, updateTransactionRows: 0, needsReviewRows: 1, errorCount: 0, duplicateCount: 1},
                    rows: [{
                        rowNumber: 2,
                        rowId: 'row-2',
                        status: 'valid',
                        action: 'needsReview',
                        reviewRequired: true,
                        reasons: ['Doublon probable à valider manuellement.'],
                        missingFields: [],
                        warnings: [],
                        errors: [],
                        duplicateCandidates: [{confidence: 0.76, reason: 'Similar transaction', entityId: 42}],
                        conflicts: [],
                        normalizedData: {date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD'},
                    }],
                })),
            },
        })

        const wrapper = mount(ImportWizardDialog, {props: {open: true, accounts: []}, attachTo: document.body})
        await wrapper.find('button.primary-btn').trigger('click')
        const parseButton = wrapper.findAll('button').find((button) => button.text().includes('Parser'))
        await parseButton!.trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('Doublons')
        expect(wrapper.text()).toContain('À revoir')
        expect(wrapper.text()).toContain('1 doublon(s) probable(s)')

        const duplicateFilter = wrapper.findAll('button').find((button) => button.text() === 'Doublons')
        await duplicateFilter!.trigger('click')
        expect(wrapper.text()).toContain('Doublon probable à valider manuellement.')

        wrapper.unmount()
    })
})
