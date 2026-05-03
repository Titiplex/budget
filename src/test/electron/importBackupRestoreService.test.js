import {describe, expect, it} from 'vitest'

const {restoreImportAuditBackup} = require('../../../electron/import/importBackupRestoreService')
const {createMemoryImportWorkflowStore} = require('../../../electron/import/importWorkflowService')

function existingBatch() {
    return {
        id: 'batch-1',
        status: 'applied',
        importType: 'transactions',
        provider: 'bank-a',
        fileName: 'bank-a.csv',
        fileHash: 'hash-existing',
        rowCount: 1,
        importedAt: '2026-05-01T10:00:00.000Z',
        rawRows: [],
        normalizedRows: [],
        errors: [],
        duplicateCandidates: [],
        decisions: [],
        appliedLinks: [{batchId: 'batch-1', normalizedRowId: 'row-existing', operation: 'created', transactionId: 1}],
    }
}

function backupBatch(overrides = {}) {
    return {
        id: 'batch-1',
        status: 'applied',
        importType: 'transactions',
        provider: 'bank-b',
        fileName: 'bank-b.csv',
        fileHash: 'hash-backup',
        rowCount: 1,
        importedAt: '2026-05-02T10:00:00.000Z',
        rawRows: [{id: 'raw-1', rowNumber: 2}],
        normalizedRows: [{id: 'row-1', rowNumber: 2, normalizedData: {label: 'Coffee'}}],
        errors: [],
        duplicateCandidates: [{batchId: 'batch-1', normalizedRowId: 'row-1', entityId: 99}],
        decisions: [{id: 'decision-1', batchId: 'batch-1', normalizedRowId: 'row-1', kind: 'importAsNew'}],
        appliedLinks: [{batchId: 'batch-1', normalizedRowId: 'row-1', operation: 'created', transactionId: 2}],
        ...overrides,
    }
}

describe('importBackupRestoreService', () => {
    it('restores import history as audit-only and remaps conflicting ids', async () => {
        const store = createMemoryImportWorkflowStore({batches: [existingBatch()], appliedLinks: existingBatch().appliedLinks})

        const result = await restoreImportAuditBackup(store, {importHistory: [backupBatch()], mode: 'merge'})
        const state = await store.load()

        expect(result).toMatchObject({
            ok: true,
            restoredBatchCount: 1,
            skippedBatchCount: 0,
            auditOnly: true,
            idMap: {'batch-1': 'restored:batch-1:1'},
        })
        expect(state.batches).toHaveLength(2)
        expect(state.batches[1]).toMatchObject({
            id: 'restored:batch-1:1',
            originalBackupBatchId: 'batch-1',
            restoredFromBackup: true,
            restoredAsAuditOnly: true,
        })
        expect(state.batches[1].decisions[0]).toMatchObject({batchId: 'restored:batch-1:1'})
        expect(state.batches[1].appliedLinks[0]).toMatchObject({batchId: 'restored:batch-1:1', transactionId: 2})
    })

    it('skips obvious duplicate import history entries during merge', async () => {
        const duplicate = backupBatch({id: 'backup-copy', fileName: 'bank-a.csv', fileHash: 'hash-existing', importedAt: '2026-05-01T10:00:00.000Z'})
        const store = createMemoryImportWorkflowStore({batches: [existingBatch()], appliedLinks: []})

        const result = await restoreImportAuditBackup(store, {importHistory: [duplicate], mode: 'merge'})
        const state = await store.load()

        expect(result).toMatchObject({restoredBatchCount: 0, skippedBatchCount: 1})
        expect(result.skippedBatches).toEqual([{id: 'backup-copy', reason: 'sameImportAuditAlreadyPresent'}])
        expect(state.batches).toHaveLength(1)
    })

    it('supports replace mode for import audit history only', async () => {
        const store = createMemoryImportWorkflowStore({batches: [existingBatch()], appliedLinks: existingBatch().appliedLinks})

        const result = await restoreImportAuditBackup(store, {importHistory: [backupBatch({id: 'fresh-batch'})], mode: 'replace'})
        const state = await store.load()

        expect(result).toMatchObject({mode: 'replace', restoredBatchCount: 1})
        expect(state.batches.map((batch) => batch.id)).toEqual(['fresh-batch'])
        expect(state.appliedLinks).toEqual([expect.objectContaining({batchId: 'fresh-batch'})])
    })

    it('rejects invalid import backup history with clear errors', async () => {
        const store = createMemoryImportWorkflowStore()

        await expect(restoreImportAuditBackup(store, {importHistory: [{id: '', status: 'applied'}]})).rejects.toMatchObject({
            code: 'invalidImportBackup',
            field: 'data.importHistory[0].id',
        })
        await expect(restoreImportAuditBackup(store, {importHistory: {id: 'bad'}})).rejects.toMatchObject({
            code: 'invalidImportBackup',
            field: 'importHistory',
        })
    })
})
