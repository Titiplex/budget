import {describe, expect, it, vi} from 'vitest'

function loadAuditedImportWorkflow() {
    return require('../../../electron/audit/auditedImportWorkflow')
}

describe('audited import workflow', () => {
    it('logs successful import apply without changing the base result', async () => {
        const {createAuditedImportWorkflow} = loadAuditedImportWorkflow()
        const baseResult = {batchId: 7, rowCount: 10, appliedCount: 9, duplicateCount: 1, errorCount: 0}
        const base = {
            applyImport: vi.fn(async () => baseResult),
            cancelImport: vi.fn(),
        }
        const auditLog = {
            logImportApplied: vi.fn(async () => null),
            logImportFailed: vi.fn(),
            recordAuditEvent: vi.fn(),
        }
        const workflow = createAuditedImportWorkflow({base, auditLog})

        const result = await workflow.applyImport({batchId: 7})

        expect(result).toBe(baseResult)
        expect(auditLog.logImportApplied).toHaveBeenCalledWith(expect.objectContaining({
            batchId: 7,
            rowCount: 10,
            appliedCount: 9,
            duplicateCount: 1,
            errorCount: 0,
        }))
        expect(auditLog.logImportFailed).not.toHaveBeenCalled()
    })

    it('logs failed import apply and preserves the original error', async () => {
        const {createAuditedImportWorkflow} = loadAuditedImportWorkflow()
        const baseError = new Error('apply failed')
        const base = {
            applyImport: vi.fn(async () => { throw baseError }),
            cancelImport: vi.fn(),
        }
        const auditLog = {
            logImportApplied: vi.fn(),
            logImportFailed: vi.fn(async () => null),
            recordAuditEvent: vi.fn(),
        }
        const workflow = createAuditedImportWorkflow({base, auditLog})

        await expect(workflow.applyImport({batchId: 8})).rejects.toBe(baseError)

        expect(auditLog.logImportFailed).toHaveBeenCalledWith({batchId: 8, error: baseError, stage: 'apply'})
    })

    it('logs import cancellation', async () => {
        const {createAuditedImportWorkflow} = loadAuditedImportWorkflow()
        const baseResult = {id: 9, status: 'CANCELLED'}
        const base = {
            applyImport: vi.fn(),
            cancelImport: vi.fn(async () => baseResult),
        }
        const auditLog = {
            logImportApplied: vi.fn(),
            logImportFailed: vi.fn(),
            recordAuditEvent: vi.fn(async () => null),
        }
        const workflow = createAuditedImportWorkflow({base, auditLog})

        const result = await workflow.cancelImport(9, 'duplicate file')

        expect(result).toBe(baseResult)
        expect(auditLog.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'importCancelled',
            domain: 'import',
            action: 'cancel',
            status: 'CANCELLED',
            entityIds: [{type: 'importBatch', id: 9}],
            metadata: {reason: 'duplicate file'},
        }))
    })
})
