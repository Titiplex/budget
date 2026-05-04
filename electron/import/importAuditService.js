const IMPORT_AUDIT_ERROR_CODES = Object.freeze({
    BATCH_NOT_FOUND: 'importBatchNotFound',
    UNSAFE_HISTORY_DELETE: 'unsafeImportHistoryDelete',
    UNSUPPORTED_EXPORT_FORMAT: 'unsupportedImportExportFormat',
})

class ImportAuditServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'ImportAuditServiceError'
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

function asTime(value) {
    const timestamp = Date.parse(String(value || ''))
    return Number.isNaN(timestamp) ? null : timestamp
}

function batchSource(batch) {
    return batch.provider || batch.source?.name || batch.source?.provider || batch.fileMetadata?.provider || 'manual'
}

function inDateRange(batch, filters = {}) {
    const candidate = asTime(batch.importedAt || batch.createdAt || batch.parsedAt || batch.appliedAt)
    if (candidate == null) return true
    const from = filters.from ? asTime(filters.from) : null
    const to = filters.to ? asTime(filters.to) : null
    if (from != null && candidate < from) return false
    if (to != null && candidate > to) return false
    return true
}

function matchesSearch(batch, search) {
    if (!search) return true
    const needle = String(search).toLowerCase().trim()
    if (!needle) return true
    const haystack = [
        batch.id,
        batch.status,
        batch.importType,
        batch.fileName,
        batch.provider,
        batchSource(batch),
        batch.fileHash,
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(needle)
}

function warningsForBatch(batch) {
    return (batch.normalizedRows || [])
        .flatMap((row) => row.validationErrors || [])
        .filter((entry) => entry.severity !== 'error')
}

function errorsForBatch(batch) {
    const rowErrors = (batch.normalizedRows || [])
        .flatMap((row) => row.validationErrors || [])
        .filter((entry) => entry.severity === 'error')
    return [...(batch.errors || []), ...rowErrors]
}

function auditSummary(batch) {
    const appliedLinks = batch.appliedLinks || []
    const decisions = batch.decisions || []
    return {
        id: batch.id,
        status: batch.status,
        importType: batch.importType,
        provider: batch.provider || null,
        source: batchSource(batch),
        fileName: batch.fileName || batch.fileMetadata?.fileName || null,
        fileHash: batch.fileHash || null,
        rowCount: batch.rowCount || 0,
        rawRowCount: (batch.rawRows || []).length,
        normalizedRowCount: (batch.normalizedRows || []).length,
        appliedRowCount: appliedLinks.length,
        createdCount: appliedLinks.filter((link) => link.operation === 'created').length,
        linkedCount: appliedLinks.filter((link) => link.operation === 'linked').length,
        updatedCount: appliedLinks.filter((link) => link.operation === 'updated').length,
        skippedCount: appliedLinks.filter((link) => link.operation === 'skipped').length,
        errorCount: errorsForBatch(batch).length,
        warningCount: warningsForBatch(batch).length,
        duplicateCount: batch.duplicateCount || (batch.duplicateCandidates || []).length,
        decisionCount: decisions.length,
        importedAt: batch.importedAt,
        parsedAt: batch.parsedAt || null,
        previewedAt: batch.previewedAt || null,
        appliedAt: batch.appliedAt || null,
        cancelledAt: batch.cancelledAt || null,
        deletedAt: batch.deletedAt || null,
    }
}

async function loadBatches(store) {
    const state = await store.load()
    return {state, batches: Array.isArray(state.batches) ? state.batches : []}
}

async function getBatchOrThrow(store, batchId) {
    const {state, batches} = await loadBatches(store)
    const batch = batches.find((entry) => String(entry.id) === String(batchId))
    if (!batch) {
        throw new ImportAuditServiceError(
            IMPORT_AUDIT_ERROR_CODES.BATCH_NOT_FOUND,
            'Le batch d’import est introuvable dans l’historique.',
            {batchId},
        )
    }
    return {state, batches, batch}
}

function filterBatches(batches, filters = {}) {
    return batches.filter((batch) => {
        if (filters.status && batch.status !== filters.status) return false
        if (filters.importType && batch.importType !== filters.importType) return false
        if (filters.source && batchSource(batch) !== filters.source) return false
        if (!inDateRange(batch, filters)) return false
        if (!matchesSearch(batch, filters.search)) return false
        return true
    })
}

async function listImportAuditHistory(store, filters = {}) {
    const {batches} = await loadBatches(store)
    return clone(filterBatches(batches, filters)
        .map(auditSummary)
        .sort((left, right) => String(right.importedAt || '').localeCompare(String(left.importedAt || ''))))
}

async function listImportAuditSources(store) {
    const {batches} = await loadBatches(store)
    return clone([...new Set(batches.map(batchSource).filter(Boolean))].sort())
}

async function getImportAuditDetail(store, batchId) {
    const {batch} = await getBatchOrThrow(store, batchId)
    const detail = {
        ...auditSummary(batch),
        source: batchSource(batch),
        parserVersion: batch.parserVersion || null,
        defaultCurrency: batch.defaultCurrency || null,
        rawRows: batch.rawRows || [],
        normalizedRows: batch.normalizedRows || [],
        errors: errorsForBatch(batch),
        warnings: warningsForBatch(batch),
        duplicateCandidates: batch.duplicateCandidates || [],
        decisions: batch.decisions || [],
        appliedLinks: batch.appliedLinks || [],
        preview: batch.preview || null,
        fileMetadata: batch.fileMetadata || null,
        template: batch.template || null,
    }
    return clone(detail)
}

async function deleteImportAuditHistory(store, batchId, options = {}) {
    const {state, batches, batch} = await getBatchOrThrow(store, batchId)
    const appliedCount = (batch.appliedLinks || []).length
    if (appliedCount > 0 && options.preserveFinancialData !== true) {
        throw new ImportAuditServiceError(
            IMPORT_AUDIT_ERROR_CODES.UNSAFE_HISTORY_DELETE,
            'Cet import a créé ou lié des éléments financiers. Confirme explicitement que la suppression ne doit effacer que l’historique.',
            {batchId, field: 'preserveFinancialData', details: {appliedCount}},
        )
    }

    state.batches = batches.filter((entry) => String(entry.id) !== String(batchId))
    state.appliedLinks = (state.appliedLinks || []).filter((link) => String(link.batchId) !== String(batchId))
    await store.save(state)
    return {
        ok: true,
        batchId,
        deletedHistory: true,
        preservedFinancialData: true,
        removedAppliedLinksFromHistory: appliedCount,
    }
}

function escapeMarkdown(value) {
    return String(value ?? '—').replace(/\|/g, '\\|')
}

function csvCell(value) {
    const raw = String(value ?? '')
    return /[",\n;]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

function rowDecision(batch, row) {
    return (batch.decisions || []).find((decision) => String(decision.normalizedRowId) === String(row.id)) || null
}

function rowAppliedLink(batch, row) {
    return (batch.appliedLinks || []).find((link) => String(link.normalizedRowId) === String(row.id)) || null
}

function buildMarkdownReport(batch) {
    const summary = auditSummary(batch)
    const lines = [
        `# Rapport d’import — ${summary.fileName || summary.id}`,
        '',
        '## Résumé',
        '',
        `- ID: ${summary.id}`,
        `- Statut: ${summary.status}`,
        `- Source: ${summary.source}`,
        `- Type: ${summary.importType}`,
        `- Date: ${summary.importedAt || '—'}`,
        `- Lignes: ${summary.rowCount}`,
        `- Appliquées: ${summary.appliedRowCount}`,
        `- Erreurs: ${summary.errorCount}`,
        `- Warnings: ${summary.warningCount}`,
        `- Doublons: ${summary.duplicateCount}`,
        '',
        '## Lignes normalisées',
        '',
        '| Ligne | Statut | Libellé/Symbole | Date | Montant/Qté | Devise | Décision | Lien appliqué |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ]

    for (const row of batch.normalizedRows || []) {
        const decision = rowDecision(batch, row)
        const link = rowAppliedLink(batch, row)
        lines.push(`| ${escapeMarkdown(row.rowNumber)} | ${escapeMarkdown(row.status)} | ${escapeMarkdown(row.normalizedData?.label || row.normalizedData?.symbol)} | ${escapeMarkdown(row.normalizedData?.date?.slice?.(0, 10) || row.transactionDate?.slice?.(0, 10))} | ${escapeMarkdown(row.normalizedData?.amount ?? row.normalizedData?.quantity ?? row.amount)} | ${escapeMarkdown(row.normalizedData?.currency || row.currency)} | ${escapeMarkdown(decision?.kind)} | ${escapeMarkdown(link?.operation)} |`)
    }

    lines.push('', '## Erreurs et warnings', '')
    const messages = [...errorsForBatch(batch), ...warningsForBatch(batch)]
    if (!messages.length) lines.push('Aucun message.')
    for (const message of messages) lines.push(`- Ligne ${message.rowNumber || '—'} · ${message.severity || 'info'} · ${message.code || 'message'}: ${message.message}`)

    lines.push('', '## Décisions de réconciliation', '')
    if (!(batch.decisions || []).length) lines.push('Aucune décision.')
    for (const decision of batch.decisions || []) lines.push(`- Ligne ${decision.rowNumber}: ${decision.kind} (${decision.status}) — ${decision.reason}`)

    lines.push('', '## Éléments créés ou liés', '')
    if (!(batch.appliedLinks || []).length) lines.push('Aucun lien appliqué.')
    for (const link of batch.appliedLinks || []) lines.push(`- Ligne ${link.normalizedRowId || '—'}: ${link.operation} ${link.entityType} ${link.transactionId || link.assetId || ''}`.trim())

    return `${lines.join('\n')}\n`
}

function buildCsvReport(batch) {
    const headers = ['batchId', 'rowNumber', 'status', 'labelOrSymbol', 'date', 'amountOrQuantity', 'currency', 'decision', 'decisionStatus', 'appliedOperation', 'targetId', 'errors', 'warnings']
    const lines = [headers.join(',')]
    for (const row of batch.normalizedRows || []) {
        const decision = rowDecision(batch, row)
        const link = rowAppliedLink(batch, row)
        const messages = row.validationErrors || []
        const errors = messages.filter((entry) => entry.severity === 'error').map((entry) => entry.message).join(' | ')
        const warnings = messages.filter((entry) => entry.severity !== 'error').map((entry) => entry.message).join(' | ')
        lines.push([
            batch.id,
            row.rowNumber,
            row.status,
            row.normalizedData?.label || row.normalizedData?.symbol || '',
            row.normalizedData?.date?.slice?.(0, 10) || row.transactionDate?.slice?.(0, 10) || '',
            row.normalizedData?.amount ?? row.normalizedData?.quantity ?? row.amount ?? '',
            row.normalizedData?.currency || row.currency || '',
            decision?.kind || '',
            decision?.status || '',
            link?.operation || '',
            link?.transactionId || link?.assetId || '',
            errors,
            warnings,
        ].map(csvCell).join(','))
    }
    return `${lines.join('\n')}\n`
}

async function exportImportAuditReport(store, batchId, options = {}) {
    const {batch} = await getBatchOrThrow(store, batchId)
    const format = options.format || 'markdown'
    if (!['markdown', 'csv'].includes(format)) {
        throw new ImportAuditServiceError(
            IMPORT_AUDIT_ERROR_CODES.UNSUPPORTED_EXPORT_FORMAT,
            'Format de rapport d’import non supporté.',
            {batchId, field: 'format', details: {format}},
        )
    }
    const safeName = String(batch.fileName || batch.id || 'import').replace(/[^a-z0-9._-]+/gi, '_')
    return {
        batchId,
        format,
        fileName: format === 'csv' ? `import-report-${safeName}.csv` : `import-report-${safeName}.md`,
        mimeType: format === 'csv' ? 'text/csv' : 'text/markdown',
        content: format === 'csv' ? buildCsvReport(batch) : buildMarkdownReport(batch),
    }
}

function toImportAuditIpcError(error) {
    if (error instanceof ImportAuditServiceError) {
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
    IMPORT_AUDIT_ERROR_CODES,
    ImportAuditServiceError,
    deleteImportAuditHistory,
    exportImportAuditReport,
    getImportAuditDetail,
    listImportAuditHistory,
    listImportAuditSources,
    toImportAuditIpcError,
}
