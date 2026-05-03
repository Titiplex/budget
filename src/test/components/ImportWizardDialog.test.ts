import {mount} from '@vue/test-utils'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import ImportWizardDialog from '../../components/ImportWizardDialog.vue'

const csvFixture = ['Date,Description,Amount,Currency,Account', '2026-05-01,Coffee,-4.50,CAD,Main'].join('\n')

function ok<T>(data: T) {
    return {ok: true, data, error: null}
}

function basePreviewRow(overrides = {}) {
    return {
        rowNumber: 2,
        rowId: 'row-2',
        status: 'valid',
        action: 'createTransaction',
        targetEntityType: 'transaction',
        targetEntityId: null,
        reviewRequired: false,
        reasons: ['Transaction prête à être créée.'],
        missingFields: [],
        warnings: [],
        errors: [],
        duplicateCandidates: [],
        conflicts: [],
        normalizedData: {date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD'},
        ...overrides,
    }
}

function mockWindowApis(previewRows = [basePreviewRow()]) {
    const createBatch = vi.fn().mockResolvedValue(ok({id: 'batch-1', status: 'draft', fileName: 'import.csv'}))
    const parseFile = vi.fn().mockResolvedValue(ok({
        batch: {id: 'batch-1', rowCount: previewRows.length, errorCount: 0},
        parsed: {headers: ['Date', 'Description', 'Amount', 'Currency', 'Account'], rawRows: [], normalizedRows: [], errors: []},
    }))
    const preview = vi.fn().mockResolvedValue(ok({
        canApply: true,
        stats: {
            totalRows: previewRows.length,
            createTransactionRows: previewRows.filter((row: any) => row.action === 'createTransaction').length,
            updateTransactionRows: previewRows.filter((row: any) => row.action === 'updateTransaction').length,
            needsReviewRows: previewRows.filter((row: any) => row.action === 'needsReview').length,
            errorCount: 0,
            duplicateCount: previewRows.filter((row: any) => row.duplicateCandidates?.length).length,
        },
        rows: previewRows,
    }))
    const applyReconciliationDecisions = vi.fn().mockResolvedValue(ok({
        batch: {status: 'applied', rowCount: previewRows.length, errorCount: 0},
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
            apply: vi.fn(),
            applyReconciliationDecisions,
            cancel: vi.fn().mockResolvedValue(ok({})),
            mappingTemplate: {
                list: vi.fn().mockResolvedValue(ok([])),
                create: vi.fn().mockResolvedValue(ok({id: 'template-1', name: 'Template import.csv'})),
            },
        },
    })

    return {createBatch, parseFile, preview, applyReconciliationDecisions}
}

async function chooseFileAndPreview(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('button.primary-btn').trigger('click')
    await wrapper.vm.$nextTick()
    const parseButton = wrapper.findAll('button').find((button) => button.text().includes('Parser'))
    expect(parseButton).toBeTruthy()
    await parseButton!.trigger('click')
    await vi.dynamicImportSettled()
    await wrapper.vm.$nextTick()
}

describe('ImportWizardDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockWindowApis()
    })

    it('guides a CSV import through preview, reconciliation and explicit confirmation', async () => {
        mockWindowApis([basePreviewRow()])
        const wrapper = mount(ImportWizardDialog, {
            props: {
                open: true,
                accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null, createdAt: '', updatedAt: ''}],
            },
            attachTo: document.body,
        })

        await chooseFileAndPreview(wrapper)

        expect(window.imports.createBatch).toHaveBeenCalled()
        expect(window.imports.parseFile).toHaveBeenCalled()
        expect(window.imports.preview).toHaveBeenCalled()
        expect(wrapper.text()).toContain('Créer transaction')
        expect(wrapper.text()).toContain('Transaction prête à être créée.')

        const reconcileButton = wrapper.findAll('button').find((button) => button.text().includes('Résoudre les décisions'))
        await reconcileButton!.trigger('click')
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).toContain('Réconciliation')
        expect(wrapper.text()).toContain('Importer comme nouveau')

        const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('Voir le résumé des décisions'))
        await confirmButton!.trigger('click')
        await wrapper.find('input[type="checkbox"]').setValue(true)
        const applyButton = wrapper.findAll('button').find((button) => button.text().includes('Appliquer les décisions'))
        await applyButton!.trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(window.imports.apply).not.toHaveBeenCalled()
        expect(window.imports.applyReconciliationDecisions).toHaveBeenCalledWith(expect.objectContaining({
            batchId: 'batch-1',
            decisions: [expect.objectContaining({kind: 'importAsNew', normalizedRowId: 'row-2'})],
        }))
        expect(wrapper.text()).toContain('Import terminé')
        expect(wrapper.emitted('applied')).toBeTruthy()

        wrapper.unmount()
    })

    it('shows duplicate and review filters instead of hiding risky rows', async () => {
        mockWindowApis([
            basePreviewRow({
                action: 'needsReview',
                reviewRequired: true,
                reasons: ['Doublon probable à valider manuellement.'],
                duplicateCandidates: [{confidence: 0.76, reason: 'Similar transaction', entityId: 42, entityType: 'transaction'}],
            }),
        ])

        const wrapper = mount(ImportWizardDialog, {props: {open: true, accounts: []}, attachTo: document.body})
        await chooseFileAndPreview(wrapper)

        expect(wrapper.text()).toContain('Doublons')
        expect(wrapper.text()).toContain('À revoir')
        expect(wrapper.text()).toContain('1 doublon(s) probable(s)')

        const duplicateFilter = wrapper.findAll('button').find((button) => button.text() === 'Doublons')
        await duplicateFilter!.trigger('click')
        expect(wrapper.text()).toContain('Doublon probable à valider manuellement.')

        wrapper.unmount()
    })

    it('blocks ambiguous duplicates until the user chooses an explicit decision', async () => {
        mockWindowApis([
            basePreviewRow({
                action: 'needsReview',
                reviewRequired: true,
                reasons: ['Doublon probable à valider manuellement.'],
                duplicateCandidates: [{confidence: 0.76, reason: 'Similar transaction', entityId: 42, entityType: 'transaction'}],
            }),
        ])
        const wrapper = mount(ImportWizardDialog, {props: {open: true, accounts: []}, attachTo: document.body})
        await chooseFileAndPreview(wrapper)

        const reconcileButton = wrapper.findAll('button').find((button) => button.text().includes('Résoudre les décisions'))
        await reconcileButton!.trigger('click')
        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('1 ligne(s) restent trop ambiguës')
        const disabledConfirm = wrapper.findAll('button').find((button) => button.text().includes('Voir le résumé des décisions'))
        expect(disabledConfirm?.attributes('disabled')).toBeDefined()

        const select = wrapper.find('select.form-input')
        await select.setValue('markAsDuplicate')
        await wrapper.vm.$nextTick()

        const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('Voir le résumé des décisions'))
        expect(confirmButton?.attributes('disabled')).toBeUndefined()
        await confirmButton!.trigger('click')
        expect(wrapper.text()).toContain('Marquer comme doublon')

        wrapper.unmount()
    })

    it('allows safe bulk decisions without applying ambiguous rows silently', async () => {
        mockWindowApis([
            basePreviewRow({rowNumber: 2, rowId: 'safe-row', action: 'createTransaction'}),
            basePreviewRow({
                rowNumber: 3,
                rowId: 'ambiguous-row',
                action: 'needsReview',
                reviewRequired: true,
                reasons: ['Doublon probable à valider manuellement.'],
                duplicateCandidates: [{confidence: 0.7, reason: 'Similar transaction', entityId: 99, entityType: 'transaction'}],
            }),
        ])
        const wrapper = mount(ImportWizardDialog, {props: {open: true, accounts: []}, attachTo: document.body})
        await chooseFileAndPreview(wrapper)

        const reconcileButton = wrapper.findAll('button').find((button) => button.text().includes('Résoudre les décisions'))
        await reconcileButton!.trigger('click')
        await wrapper.vm.$nextTick()

        const bulkButton = wrapper.findAll('button').find((button) => button.text().includes('Appliquer décisions sûres en masse'))
        await bulkButton!.trigger('click')
        expect(wrapper.text()).toContain('1 ligne(s) sûre(s) préparée(s)')
        expect(wrapper.text()).toContain('1 ligne(s) restent trop ambiguës')

        wrapper.unmount()
    })
})
