import {describe, expect, it} from 'vitest'

const {
    deleteImportAuditHistory,
    exportImportAuditReport,
    getImportAuditDetail,
    listImportAuditHistory,
    listImportAuditSources,
} = require('../../../electron/import/importAuditService')
const {createMemoryImportWorkflowStore} = require('../../../electron/import/importWorkflowService')

function storeWithHistory() {
    return createMemoryImportWorkflowStore({
        batches: [
            {
                id: 'batch-1',
                status: 'applied',
                importType: 'transactions',
                provider: 'bank-a',
                fileName: 'bank-a.csv',
                fileHash: 'hash-1',
                rowCount: 2,
                importedAt: '2026-05-01T10:00:00.000Z',
                parsedAt: '2026-05-01T10:00:01.000Z',
                previewedAt: '2026-05-01T10:00:02.000Z',
                appliedAt: '2026-05-01T10:00:03.000Z',
                rawRows: [
                    {id: 'raw-1', rowNumber: 2, rawText: '2026-05-01,Coffee,-4.50,CAD', status: 'normalized'},
                    {id: 'raw-2', rowNumber: 3, rawText: 'bad-date,Broken,abc,CAD', status: 'invalid'},
                ],
                normalizedRows: [
                    {id: 'row-1', rowNumber: 2, status: 'valid', normalizedData: {date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD'}, validationErrors: []},
                    {id: 'row-2', rowNumber: 3, status: 'invalid', normalizedData: {label: 'Broken', currency: 'CAD'}, validationErrors: [{rowNumber: 3, severity: 'error', code: 'invalidDate', message: 'Date invalide', field: 'date'}]},
                ],
                errors: [{rowNumber: 3, severity: 'error', code: 'invalidAmount', message: 'Montant invalide', field: 'amount'}],
                duplicateCandidates: [{normalizedRowId: 'row-1', entityType: 'transaction', entityId: 42, confidence: 0.99, reason: 'Same hash'}],
                decisions: [{id: 'decision-1', rowNumber: 2, normalizedRowId: 'row-1', kind: 'importAsNew', status: 'applied', reason: 'Transaction prête', reasonSource: 'automatic', history: [{status: 'applied'}]}],
                appliedLinks: [{batchId: 'batch-1', normalizedRowId: 'row-1', operation: 'created', entityType: 'transaction', transactionId: 'tx-1', appliedAt: '2026-05-01T10:00:03.000Z'}],
            },
            {
                id: 'batch-2',
                status: 'cancelled',
                importType: 'investments',
                provider: 'broker-b',
                fileName: 'broker-b.csv',
                rowCount: 1,
                importedAt: '2026-05-02T10:00:00.000Z',
                rawRows: [],
                normalizedRows: [],
                errors: [],
                duplicateCandidates: [],
                decisions: [],
                appliedLinks: [],
            },
        ],
        appliedLinks: [{batchId: 'batch-1', normalizedRowId: 'row-1', operation: 'created', entityType: 'transaction', transactionId: 'tx-1'}],
        existingRows: [],
    })
}

describe('importAuditService', () => {
    it('lists filtered import history with audit counts', async () => {
        const store = storeWithHistory()

        const all = await listImportAuditHistory(store)
        const filtered = await listImportAuditHistory(store, {status: 'applied', source: 'bank-a', importType: 'transactions', from: '2026-05-01', to: '2026-05-02'})

        expect(all).toHaveLength(2)
        expect(filtered).toEqual([
            expect.objectContaining({
                id: 'batch-1',
                source: 'bank-a',
                rowCount: 2,
                appliedRowCount: 1,
                errorCount: 2,
                duplicateCount: 1,
                decisionCount: 1,
                createdCount: 1,
            }),
        ])
    })

    it('returns import detail with raw rows, normalized rows, messages, decisions and links', async () => {
        const detail = await getImportAuditDetail(storeWithHistory(), 'batch-1')

        expect(detail.rawRows).toHaveLength(2)
        expect(detail.normalizedRows).toHaveLength(2)
        expect(detail.errors).toEqual(expect.arrayContaining([expect.objectContaining({code: 'invalidDate'}), expect.objectContaining({code: 'invalidAmount'})]))
        expect(detail.duplicateCandidates).toHaveLength(1)
        expect(detail.decisions[0]).toMatchObject({kind: 'importAsNew', status: 'applied'})
        expect(detail.appliedLinks[0]).toMatchObject({operation: 'created', transactionId: 'tx-1'})
    })

    it('exports markdown and CSV audit reports', async () => {
        const store = storeWithHistory()
        const markdown = await exportImportAuditReport(store, 'batch-1', {format: 'markdown'})
        const csv = await exportImportAuditReport(store, 'batch-1', {format: 'csv'})

        expect(markdown.fileName).toContain('.md')
        expect(markdown.content).toContain('# Rapport d’import')
        expect(markdown.content).toContain('## Décisions de réconciliation')
        expect(csv.fileName).toContain('.csv')
        expect(csv.content).toContain('batchId,rowNumber,status')
        expect(csv.content).toContain('batch-1,2,valid')
    })

    it('blocks unsafe history deletion unless preserving financial data is explicit', async () => {
        const store = storeWithHistory()

        await expect(deleteImportAuditHistory(store, 'batch-1')).rejects.toMatchObject({code: 'unsafeImportHistoryDelete'})
        const deleted = await deleteImportAuditHistory(store, 'batch-1', {preserveFinancialData: true})
        const remaining = await listImportAuditHistory(store)

        expect(deleted).toMatchObject({deletedHistory: true, preservedFinancialData: true, removedAppliedLinksFromHistory: 1})
        expect(remaining.map((item) => item.id)).toEqual(['batch-2'])
    })

    it('lists available sources for filters', async () => {
        await expect(listImportAuditSources(storeWithHistory())).resolves.toEqual(['bank-a', 'broker-b'])
    })
})
