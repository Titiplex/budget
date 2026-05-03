const IMPORT_BACKUP_RESTORE_ERROR_CODES = Object.freeze({
    INVALID_IMPORT_BACKUP: 'invalidImportBackup',
    RESTORE_FAILED: 'importHistoryRestoreFailed',
})

class ImportBackupRestoreServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'ImportBackupRestoreServiceError'
        this.code = code
        this.field = options.field || null
        this.batchId = options.batchId || null
        this.details = options.details || null
        this.recoverable = options.recoverable ?? true
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureArray(value, field) {
    if (value == null) return []
    if (!Array.isArray(value)) {
        throw new ImportBackupRestoreServiceError(
            IMPORT_BACKUP_RESTORE_ERROR_CODES.INVALID_IMPORT_BACKUP,
            `${field} doit être un tableau dans le backup d’import.`,
            {field},
        )
    }
    return value
}

function requireString(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new ImportBackupRestoreServiceError(
            IMPORT_BACKUP_RESTORE_ERROR_CODES.INVALID_IMPORT_BACKUP,
            `${field} doit être une chaîne non vide dans le backup d’import.`,
            {field},
        )
    }
    return value.trim()
}

function normalizeBatch(batch, index) {
    if (!isRecord(batch)) {
        throw new ImportBackupRestoreServiceError(
            IMPORT_BACKUP_RESTORE_ERROR_CODES.INVALID_IMPORT_BACKUP,
            `data.importHistory[${index}] doit être un objet.`,
            {field: `data.importHistory.${index}`},
        )
    }

    return {
        ...clone(batch),
        id: requireString(batch.id, `data.importHistory[${index}].id`),
        status: requireString(batch.status || 'restored', `data.importHistory[${index}].status`),
        importType: requireString(batch.importType || 'mixed', `data.importHistory[${index}].importType`),
        provider: batch.provider || batch.source || batch.fileMetadata?.provider || 'restored-backup',
        fileName: batch.fileName || batch.fileMetadata?.fileName || null,
        rowCount: Number.isFinite(batch.rowCount) ? Number(batch.rowCount) : ensureArray(batch.normalizedRows, `data.importHistory[${index}].normalizedRows`).length,
        rawRows: ensureArray(batch.rawRows, `data.importHistory[${index}].rawRows`),
        normalizedRows: ensureArray(batch.normalizedRows, `data.importHistory[${index}].normalizedRows`),
        errors: ensureArray(batch.errors, `data.importHistory[${index}].errors`),
        duplicateCandidates: ensureArray(batch.duplicateCandidates, `data.importHistory[${index}].duplicateCandidates`),
        decisions: ensureArray(batch.decisions, `data.importHistory[${index}].decisions`),
        appliedLinks: ensureArray(batch.appliedLinks, `data.importHistory[${index}].appliedLinks`),
        restoredFromBackup: true,
        restoredAt: new Date().toISOString(),
        restoredAsAuditOnly: true,
    }
}

function remapBatchId(batch, nextId) {
    const previousId = batch.id
    return {
        ...batch,
        id: nextId,
        originalBackupBatchId: previousId,
        duplicateCandidates: (batch.duplicateCandidates || []).map((candidate) => ({...candidate, batchId: nextId})),
        decisions: (batch.decisions || []).map((decision) => ({...decision, batchId: nextId})),
        appliedLinks: (batch.appliedLinks || []).map((link) => ({...link, batchId: nextId})),
    }
}

function makeRestoredId(originalId, existingIds, usedIds) {
    if (!existingIds.has(originalId) && !usedIds.has(originalId)) return originalId
    let index = 1
    let candidate = `restored:${originalId}:${index}`
    while (existingIds.has(candidate) || usedIds.has(candidate)) {
        index += 1
        candidate = `restored:${originalId}:${index}`
    }
    return candidate
}

function batchKey(batch) {
    return [batch.fileHash, batch.fileName, batch.importedAt, batch.rowCount].filter(Boolean).join('|')
}

async function restoreImportAuditBackup(store, input = {}) {
    const mode = input.mode === 'replace' ? 'replace' : 'merge'
    const importedBatches = ensureArray(input.importHistory || input.batches, 'importHistory').map(normalizeBatch)
    const state = await store.load()
    const existingBatches = Array.isArray(state.batches) ? state.batches : []
    const existingIds = new Set(existingBatches.map((batch) => String(batch.id)))
    const existingKeys = new Set(existingBatches.map(batchKey).filter(Boolean))
    const usedIds = new Set()
    const restoredBatches = []
    const skippedBatches = []
    const idMap = {}

    for (const batch of importedBatches) {
        const key = batchKey(batch)
        if (key && existingKeys.has(key)) {
            skippedBatches.push({id: batch.id, reason: 'sameImportAuditAlreadyPresent'})
            continue
        }
        const nextId = makeRestoredId(String(batch.id), existingIds, usedIds)
        usedIds.add(nextId)
        idMap[batch.id] = nextId
        restoredBatches.push(remapBatchId(batch, nextId))
    }

    state.batches = mode === 'replace' ? restoredBatches : [...existingBatches, ...restoredBatches]
    const restoredLinks = restoredBatches.flatMap((batch) => batch.appliedLinks || [])
    state.appliedLinks = mode === 'replace' ? restoredLinks : [...(state.appliedLinks || []), ...restoredLinks]
    await store.save(state)

    return {
        ok: true,
        restoredBatchCount: restoredBatches.length,
        skippedBatchCount: skippedBatches.length,
        idMap,
        skippedBatches,
        mode,
        auditOnly: true,
    }
}

function toImportBackupRestoreIpcError(error) {
    if (error instanceof ImportBackupRestoreServiceError) {
        return {
            code: error.code,
            message: error.message,
            field: error.field,
            batchId: error.batchId,
            details: error.details,
            recoverable: error.recoverable,
        }
    }
    return null
}

module.exports = {
    IMPORT_BACKUP_RESTORE_ERROR_CODES,
    ImportBackupRestoreServiceError,
    restoreImportAuditBackup,
    toImportBackupRestoreIpcError,
}
