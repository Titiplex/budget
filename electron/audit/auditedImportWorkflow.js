function createAuditedImportWorkflow({base, auditLog, integrityCheck = null}) {
    if (!base) throw new Error('base import workflow handlers are required')
    if (!auditLog) throw new Error('auditLog is required')

    async function runPostImportIntegrityCheck(input, result) {
        if (!integrityCheck || typeof integrityCheck.run !== 'function') return null
        try {
            return await integrityCheck.run({
                source: 'import-workflow',
                reason: 'after-import-apply',
                auditCritical: true,
                batchId: input?.batchId || result?.batchId || result?.id,
            })
        } catch (_error) {
            return null
        }
    }

    async function applyImport(input) {
        try {
            const result = await base.applyImport(input)
            await auditLog.logImportApplied({
                batchId: input?.batchId || result?.batchId || result?.id,
                rowCount: result?.rowCount,
                appliedCount: result?.appliedCount || result?.createdCount || result?.updatedCount,
                duplicateCount: result?.duplicateCount,
                errorCount: result?.errorCount,
            })
            await runPostImportIntegrityCheck(input, result)
            return result
        } catch (error) {
            await auditLog.logImportFailed({batchId: input?.batchId, error, stage: 'apply'})
            throw error
        }
    }

    async function cancelImport(batchId, reason) {
        const result = await base.cancelImport(batchId, reason)
        await auditLog.recordAuditEvent({
            eventType: 'importCancelled',
            domain: 'import',
            action: 'cancel',
            severity: 'WARNING',
            status: 'CANCELLED',
            summary: `Import ${batchId} annulé.`,
            source: 'import-workflow',
            entityIds: [{type: 'importBatch', id: batchId}],
            metadata: {reason},
        })
        return result
    }

    return {
        ...base,
        applyImport,
        cancelImport,
    }
}

module.exports = {createAuditedImportWorkflow}
