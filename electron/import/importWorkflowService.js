const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const IMPORT_WORKFLOW_ERROR_CODES = Object.freeze({
    BATCH_NOT_FOUND: 'importBatchNotFound',
    INVALID_FILE: 'invalidImportFile',
    INCOMPLETE_MAPPING: 'incompleteMapping',
    PREVIEW_EXPIRED: 'previewExpired',
    DECISION_CONFLICT: 'decisionConflict',
    WRITE_FAILED: 'importWriteFailed',
    INVALID_DECISION: 'invalidReconciliationDecision',
})

const PREVIEW_TTL_MS = 30 * 60 * 1000

class ImportWorkflowServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'ImportWorkflowServiceError'
        this.code = code
        this.field = options.field || null
        this.batchId = options.batchId || null
        this.rowNumber = options.rowNumber || null
        this.details = options.details || null
        this.recoverable = options.recoverable ?? true
    }
}

function nowIso() {
    return new Date().toISOString()
}

function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function hash(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function normalizeHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function splitCsvLine(line, delimiter) {
    const cells = []
    let cell = ''
    let inQuotes = false
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index]
        const next = line[index + 1]
        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"'
                index += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }
        if (char === delimiter && !inQuotes) {
            cells.push(cell.trim())
            cell = ''
            continue
        }
        cell += char
    }
    if (inQuotes) {
        throw new ImportWorkflowServiceError(
            IMPORT_WORKFLOW_ERROR_CODES.INVALID_FILE,
            'Le fichier CSV contient un champ entre guillemets non terminé.',
            {field: 'rawText'},
        )
    }
    cells.push(cell.trim())
    return cells
}

function detectDelimiter(rawText, fallback = null) {
    if (fallback) return fallback === 'tab' ? '\t' : fallback
    const sample = String(rawText || '').split(/\r?\n/).find((line) => line.trim()) || ''
    const candidates = [',', ';', '\t']
    return candidates
        .map((delimiter) => ({delimiter, count: splitCsvLine(sample, delimiter).length}))
        .sort((left, right) => right.count - left.count)[0]?.delimiter || ','
}

function parseDate(value, format = 'auto') {
    const raw = String(value || '').trim()
    if (!raw) return null
    const patterns = {
        'yyyy-MM-dd': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        'yyyy/MM/dd': /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
        'dd/MM/yyyy': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        'MM/dd/yyyy': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        'dd-MM-yyyy': /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
        yyyyMMdd: /^(\d{4})(\d{2})(\d{2})$/,
    }
    const formats = format === 'auto' ? Object.keys(patterns) : [format]
    for (const currentFormat of formats) {
        const match = raw.match(patterns[currentFormat])
        if (!match) continue
        const year = currentFormat.startsWith('dd') ? Number(match[3]) : Number(match[1])
        const month = currentFormat === 'dd/MM/yyyy' || currentFormat === 'dd-MM-yyyy' ? Number(match[2]) : currentFormat === 'MM/dd/yyyy' ? Number(match[1]) : Number(match[2])
        const day = currentFormat === 'dd/MM/yyyy' || currentFormat === 'dd-MM-yyyy' ? Number(match[1]) : currentFormat === 'MM/dd/yyyy' ? Number(match[2]) : Number(match[3])
        const date = new Date(Date.UTC(year, month - 1, day))
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString()
    }
    const timestamp = Date.parse(raw)
    if (Number.isNaN(timestamp)) return null
    return new Date(timestamp).toISOString()
}

function parseNumber(value, decimalSeparator = 'auto') {
    const raw = String(value || '').trim()
    if (!raw || !/\d/.test(raw)) return null
    const selectedDecimal = decimalSeparator === 'auto' ? (raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.') : decimalSeparator
    const thousandsSeparator = selectedDecimal === ',' ? '.' : ','
    const negative = /^\(.*\)$/.test(raw)
    let sanitized = raw
        .replace(/^\((.*)\)$/, '$1')
        .replace(/[\s\u00a0']/g, '')
        .replace(/[A-Za-z$€£¥₿]/g, '')
        .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
    if (selectedDecimal === ',') sanitized = sanitized.replace(',', '.')
    const parsed = Number(sanitized)
    if (!Number.isFinite(parsed)) return null
    return negative ? -Math.abs(parsed) : parsed
}

function mappingPairs(template = {}) {
    const defaults = [
        ['date', ['date', 'transaction date', 'trade date', 'operation date', 'jour']],
        ['label', ['label', 'description', 'details', 'libelle', 'libellé']],
        ['amount', ['amount', 'montant', 'total', 'value']],
        ['currency', ['currency', 'devise', 'ccy']],
        ['quantity', ['quantity', 'qty', 'shares', 'quantite', 'quantité']],
        ['unitPrice', ['unit price', 'price', 'prix unitaire', 'prix']],
        ['fees', ['fees', 'fee', 'commission', 'frais']],
        ['taxes', ['taxes', 'tax', 'withholding tax', 'taxe', 'impôt', 'impot']],
        ['symbol', ['symbol', 'ticker', 'isin', 'instrument', 'symbole']],
        ['operationType', ['type', 'operation type', 'transaction type', 'action']],
        ['accountName', ['account', 'account name', 'compte']],
        ['sourceName', ['source', 'provider', 'broker', 'courtier']],
    ]
    const pairs = new Map(defaults.map(([field, aliases]) => [field, aliases.map(normalizeHeader)]))
    for (const mapping of template.columnMappings || []) {
        const aliases = pairs.get(mapping.targetField) || []
        pairs.set(mapping.targetField, [normalizeHeader(mapping.sourceColumn), ...aliases])
    }
    return pairs
}

function readMapped(record, pairs, field) {
    for (const alias of pairs.get(field) || []) {
        if (record[alias] != null && String(record[alias]).trim() !== '') return String(record[alias]).trim()
    }
    return ''
}

function parseCsvImport(rawText, options = {}) {
    const delimiter = detectDelimiter(rawText, options.delimiter)
    const lines = String(rawText || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
    if (!lines.length) {
        throw new ImportWorkflowServiceError(
            IMPORT_WORKFLOW_ERROR_CODES.INVALID_FILE,
            'Le fichier importé est vide ou illisible.',
            {field: 'rawText'},
        )
    }
    const hasHeader = options.hasHeader ?? true
    const rawHeaders = hasHeader ? splitCsvLine(lines[0], delimiter) : splitCsvLine(lines[0], delimiter).map((_cell, index) => `column${index + 1}`)
    const headers = rawHeaders.map(normalizeHeader)
    const dataLines = hasHeader ? lines.slice(1) : lines
    const pairs = mappingPairs(options.mappingTemplate)
    const rawRows = []
    const normalizedRows = []
    const errors = []

    dataLines.forEach((line, index) => {
        const rowNumber = index + (hasHeader ? 2 : 1)
        const cells = splitCsvLine(line, delimiter)
        const record = {}
        headers.forEach((header, headerIndex) => {
            record[header] = cells[headerIndex] || ''
        })
        const rowErrors = []
        const rowWarnings = []
        const normalizedData = {}
        const dateRaw = readMapped(record, pairs, 'date')
        const date = parseDate(dateRaw, options.dateFormat || options.mappingTemplate?.dateFormat || 'auto')
        if (!date) rowErrors.push({rowNumber, stage: 'validation', severity: 'error', code: 'invalidDate', message: dateRaw ? `Date invalide: ${dateRaw}` : 'Date obligatoire manquante.', field: 'date'})
        else normalizedData.date = date

        const label = readMapped(record, pairs, 'label')
        if (label) normalizedData.label = label
        else rowWarnings.push({rowNumber, stage: 'validation', severity: 'warning', code: 'missingLabel', message: 'Libellé/description manquant.', field: 'label'})

        const currency = (readMapped(record, pairs, 'currency') || options.defaultCurrency || options.mappingTemplate?.defaultCurrency || 'CAD').toUpperCase()
        if (!/^[A-Z]{3}$/.test(currency)) rowErrors.push({rowNumber, stage: 'validation', severity: 'error', code: 'invalidCurrency', message: `Devise invalide: ${currency}`, field: 'currency'})
        else normalizedData.currency = currency

        for (const field of ['amount', 'quantity', 'unitPrice', 'fees', 'taxes']) {
            const raw = readMapped(record, pairs, field)
            if (!raw) continue
            const parsed = parseNumber(raw, options.decimalSeparator || options.mappingTemplate?.decimalSeparator || 'auto')
            if (parsed == null) rowErrors.push({rowNumber, stage: 'validation', severity: 'error', code: 'invalidAmount', message: `Valeur numérique invalide pour ${field}: ${raw}`, field})
            else normalizedData[field] = parsed
        }
        for (const field of ['symbol', 'operationType', 'accountName', 'sourceName']) {
            const raw = readMapped(record, pairs, field)
            if (!raw) continue
            normalizedData[field] = field === 'symbol' || field === 'operationType' ? raw.toUpperCase().replace(/\s+/g, '_') : raw
        }
        if (normalizedData.amount == null && normalizedData.quantity == null && normalizedData.unitPrice == null) rowErrors.push({rowNumber, stage: 'validation', severity: 'error', code: 'invalidAmount', message: 'Montant, quantité ou prix obligatoire manquant.', field: 'amount'})

        const rowId = `row-${rowNumber}`
        const normalizedRow = {
            id: rowId,
            rowNumber,
            rawRowId: `raw-${rowNumber}`,
            status: rowErrors.length ? 'invalid' : 'valid',
            targetKind: normalizedData.symbol || normalizedData.quantity || normalizedData.unitPrice ? 'investmentMovement' : 'transaction',
            normalizedData,
            transactionDate: normalizedData.date || null,
            label: normalizedData.label || null,
            amount: normalizedData.amount ?? null,
            currency: normalizedData.currency || null,
            accountName: normalizedData.accountName || null,
            duplicateKey: normalizedData.date && normalizedData.amount != null ? `${normalizedData.date.slice(0, 10)}:${normalizedData.amount}:${normalizedData.currency}:${normalizedData.label || ''}` : null,
            duplicateConfidence: null,
            validationErrors: [...rowErrors, ...rowWarnings],
            duplicateCandidates: [],
        }
        rawRows.push({id: `raw-${rowNumber}`, rowNumber, rawText: line, rawJson: record, status: rowErrors.length ? 'invalid' : 'normalized'})
        normalizedRows.push(normalizedRow)
        errors.push(...rowErrors)
    })

    return {delimiter, hasHeader, headers: rawHeaders, rawRows, normalizedRows, errors}
}

function normalizedHash(row) {
    return hash(JSON.stringify({
        date: row.transactionDate?.slice(0, 10) || row.normalizedData?.date?.slice?.(0, 10) || null,
        amount: row.amount ?? row.normalizedData?.amount ?? null,
        currency: row.currency || row.normalizedData?.currency || null,
        label: normalizeHeader(row.label || row.normalizedData?.label || ''),
        symbol: row.normalizedData?.symbol || null,
        quantity: row.normalizedData?.quantity ?? null,
        unitPrice: row.normalizedData?.unitPrice ?? null,
    }))
}

function findDuplicates(rows, existingRows = [], repeatedFileHash = null) {
    const references = new Map()
    for (const existing of existingRows) references.set(existing.normalizedHash || normalizedHash(existing), existing)
    const candidates = []
    const seenInBatch = new Map()
    return rows.map((row) => {
        const rowHash = normalizedHash(row)
        const rowCandidates = []
        if (references.has(rowHash)) {
            const existing = references.get(rowHash)
            rowCandidates.push({normalizedRowId: row.id, entityType: existing.targetKind || 'transaction', entityId: existing.entityId || existing.id, confidence: existing.fileHash && repeatedFileHash && existing.fileHash === repeatedFileHash ? 1 : 0.99, strategy: 'strict', reason: existing.fileHash === repeatedFileHash ? 'Même fichier déjà importé.' : 'Même hash de ligne normalisée.', matchFields: ['normalizedHash'], candidateSnapshot: existing.normalizedData || existing})
        }
        if (seenInBatch.has(rowHash)) {
            const previous = seenInBatch.get(rowHash)
            rowCandidates.push({normalizedRowId: row.id, entityType: row.targetKind || 'transaction', entityId: previous.id, confidence: 1, strategy: 'strict', reason: 'Doublon exact dans le même batch.', matchFields: ['normalizedHash'], candidateSnapshot: previous.normalizedData})
        }
        seenInBatch.set(rowHash, row)
        candidates.push(...rowCandidates)
        return {...row, duplicateCandidates: [...(row.duplicateCandidates || []), ...rowCandidates], duplicateConfidence: rowCandidates[0]?.confidence || null, duplicateKey: row.duplicateKey || rowHash}
    })
}

function buildPreview(batch, options = {}) {
    const rows = batch.normalizedRows || []
    const previewRows = rows.map((row) => {
        const errors = (row.validationErrors || []).filter((entry) => entry.severity === 'error')
        const warnings = (row.validationErrors || []).filter((entry) => entry.severity !== 'error')
        const duplicate = row.duplicateCandidates?.[0]
        const isInvestment = row.targetKind === 'investmentMovement' || row.normalizedData?.symbol || row.normalizedData?.quantity || row.normalizedData?.unitPrice
        const missingFields = []
        if (!row.normalizedData?.date) missingFields.push('date')
        if (!row.normalizedData?.currency) missingFields.push('currency')
        if (!isInvestment && row.normalizedData?.amount == null) missingFields.push('amount')
        if (!options.targetAccountId && !isInvestment && !row.normalizedData?.accountName) missingFields.push('targetAccountOrAccountName')
        if (isInvestment && !options.targetPortfolioId && !row.normalizedData?.sourceName && !row.normalizedData?.accountName) missingFields.push('targetPortfolioOrSource')

        let action = isInvestment ? 'createAssetOperation' : 'createTransaction'
        const reasons = []
        if (errors.length) {
            action = 'skip'
            reasons.push(...errors.map((entry) => entry.message))
        } else if (missingFields.length) {
            action = 'needsReview'
            reasons.push(`Données manquantes: ${missingFields.join(', ')}.`)
        } else if (duplicate) {
            if (duplicate.confidence >= 0.98) {
                action = duplicate.entityType === 'transaction' ? 'updateTransaction' : 'needsReview'
                reasons.push('Doublon exact ou très probable détecté.')
            } else {
                action = 'needsReview'
                reasons.push('Doublon probable à valider manuellement.')
            }
        } else {
            reasons.push(isInvestment ? 'Opération d’actif prête à être créée.' : 'Transaction prête à être créée.')
        }
        reasons.push(...warnings.map((entry) => entry.message))

        return {
            rowNumber: row.rowNumber,
            rowId: row.id,
            rawRowId: row.rawRowId,
            status: row.status,
            action,
            targetEntityType: isInvestment ? 'investmentMovement' : 'transaction',
            targetAccountId: options.targetAccountId || null,
            targetPortfolioId: options.targetPortfolioId || null,
            targetEntityId: action === 'updateTransaction' ? duplicate?.entityId || null : null,
            reviewRequired: action === 'needsReview',
            reasons,
            missingFields,
            warnings,
            errors,
            duplicateCandidates: row.duplicateCandidates || [],
            conflicts: [],
            normalizedData: row.normalizedData,
        }
    })
    const warnings = previewRows.flatMap((row) => row.warnings)
    const blockingErrors = previewRows.flatMap((row) => row.errors)
    const duplicateCandidates = previewRows.flatMap((row) => row.duplicateCandidates)
    return {
        dryRun: true,
        batchId: batch.id,
        source: batch.source || null,
        template: batch.template || null,
        targetAccountId: options.targetAccountId || null,
        targetPortfolioId: options.targetPortfolioId || null,
        defaultCurrency: batch.defaultCurrency || options.defaultCurrency || 'CAD',
        rows: previewRows,
        readyRows: previewRows.filter((row) => ['createTransaction', 'updateTransaction', 'createAssetOperation'].includes(row.action)),
        invalidRows: previewRows.filter((row) => row.action === 'skip'),
        warnings,
        blockingErrors,
        duplicateCandidates,
        conflicts: [],
        stats: {
            totalRows: previewRows.length,
            validRows: previewRows.filter((row) => row.action !== 'skip').length,
            invalidRows: previewRows.filter((row) => row.action === 'skip').length,
            errorCount: blockingErrors.length,
            warningCount: warnings.length,
            duplicateCount: previewRows.filter((row) => row.duplicateCandidates.length).length,
            conflictCount: 0,
            missingDataCount: previewRows.filter((row) => row.missingFields.length).length,
            needsReviewRows: previewRows.filter((row) => row.action === 'needsReview').length,
            createTransactionRows: previewRows.filter((row) => row.action === 'createTransaction').length,
            updateTransactionRows: previewRows.filter((row) => row.action === 'updateTransaction').length,
            createAssetOperationRows: previewRows.filter((row) => row.action === 'createAssetOperation').length,
            skippedRows: previewRows.filter((row) => row.action === 'skip').length,
        },
        canApply: previewRows.some((row) => ['createTransaction', 'updateTransaction', 'createAssetOperation'].includes(row.action)),
        generatedAt: nowIso(),
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
    }
}

function defaultDecisionForPreviewRow(row, batchId) {
    const kind = row.action === 'createTransaction' || row.action === 'createAssetOperation'
        ? 'importAsNew'
        : row.action === 'updateTransaction'
            ? 'updateExisting'
            : row.action === 'skip'
                ? 'skip'
                : 'needsManualReview'
    return {
        id: makeId('decision'),
        batchId,
        normalizedRowId: row.rowId,
        rowNumber: row.rowNumber,
        kind,
        status: 'pending',
        targetEntityType: row.targetEntityType,
        targetEntityId: row.targetEntityId || null,
        payload: {previewAction: row.action},
        reason: row.reasons[0] || 'Décision générée depuis la preview.',
        reasonSource: 'automatic',
        decidedBy: 'system',
        decidedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        history: [{at: nowIso(), actor: 'system', status: 'pending', message: row.reasons[0] || 'Décision générée depuis la preview.', metadata: {reasonSource: 'automatic'}}],
    }
}

function createMemoryImportWorkflowStore(initialState = {}) {
    let state = {
        batches: [],
        appliedLinks: [],
        existingRows: [],
        ...clone(initialState),
    }
    return {
        async load() {
            return clone(state)
        },
        async save(nextState) {
            state = clone(nextState)
            return clone(state)
        },
    }
}

function createFileImportWorkflowStore(filePath) {
    return {
        async load() {
            try {
                const content = await fs.readFile(filePath, 'utf8')
                return JSON.parse(content)
            } catch (error) {
                if (error.code === 'ENOENT') return {batches: [], appliedLinks: [], existingRows: []}
                throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.WRITE_FAILED, 'Impossible de lire l’historique d’import local.', {details: {filePath, cause: error.message}, recoverable: false})
            }
        },
        async save(state) {
            try {
                await fs.mkdir(path.dirname(filePath), {recursive: true})
                await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
                return state
            } catch (error) {
                throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.WRITE_FAILED, 'Impossible d’écrire l’historique d’import local.', {details: {filePath, cause: error.message}, recoverable: false})
            }
        },
    }
}

function defaultImportWorkflowStore(app) {
    if (!app || typeof app.getPath !== 'function') return createMemoryImportWorkflowStore()
    return createFileImportWorkflowStore(path.join(app.getPath('userData'), 'import-workflow-history.json'))
}

async function createImportBatch(store, input = {}) {
    const state = await store.load()
    const timestamp = nowIso()
    const batch = {
        id: makeId('batch'),
        status: 'draft',
        importType: input.importType || input.template?.importType || 'transactions',
        provider: input.fileMetadata?.provider || input.source?.provider || null,
        fileName: input.fileMetadata?.fileName || null,
        fileHash: input.fileMetadata?.fileHash || null,
        defaultCurrency: input.defaultCurrency || input.template?.defaultCurrency || 'CAD',
        parserVersion: 'electron-import-workflow-v1',
        source: input.source || null,
        template: input.template || null,
        fileMetadata: input.fileMetadata || null,
        rowCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        importedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        rawRows: [],
        normalizedRows: [],
        errors: [],
        duplicateCandidates: [],
        decisions: [],
        appliedLinks: [],
        preview: null,
    }
    state.batches.push(batch)
    await store.save(state)
    return clone(batch)
}

async function getBatchOrThrow(store, batchId) {
    const state = await store.load()
    const batch = state.batches.find((entry) => entry.id === batchId)
    if (!batch) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.BATCH_NOT_FOUND, 'Le batch d’import est introuvable.', {batchId})
    return {state, batch}
}

async function parseImportFile(store, input = {}) {
    const {state, batch} = await getBatchOrThrow(store, input.batchId)
    if (!input.rawText && !input.fileBufferBase64) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.INVALID_FILE, 'Aucun contenu de fichier à parser.', {field: 'rawText', batchId: input.batchId})
    const rawText = input.rawText || Buffer.from(input.fileBufferBase64, 'base64').toString('utf8')
    const parsed = parseCsvImport(rawText, {
        delimiter: input.delimiter || input.mappingTemplate?.delimiter || batch.template?.delimiter,
        hasHeader: input.hasHeader ?? input.mappingTemplate?.hasHeader ?? batch.template?.hasHeader ?? true,
        mappingTemplate: input.mappingTemplate || batch.template,
        defaultCurrency: input.defaultCurrency || batch.defaultCurrency,
        dateFormat: input.dateFormat,
        decimalSeparator: input.decimalSeparator,
    })
    batch.status = parsed.errors.length ? 'parsed' : 'parsed'
    batch.fileHash = batch.fileHash || hash(rawText)
    batch.rawRows = parsed.rawRows
    batch.normalizedRows = parsed.normalizedRows
    batch.errors = parsed.errors
    batch.rowCount = parsed.normalizedRows.length
    batch.errorCount = parsed.errors.length
    batch.updatedAt = nowIso()
    batch.parsedAt = batch.updatedAt
    await store.save(state)
    return {batch: clone(batch), parsed}
}

async function previewImport(store, input = {}) {
    const {state, batch} = await getBatchOrThrow(store, input.batchId)
    if (!batch.normalizedRows?.length) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.INVALID_FILE, 'Le batch doit être parsé avant la preview.', {batchId: input.batchId})
    const normalizedRows = findDuplicates(batch.normalizedRows, state.existingRows || [], batch.fileHash)
    batch.normalizedRows = normalizedRows
    batch.duplicateCandidates = normalizedRows.flatMap((row) => row.duplicateCandidates || [])
    batch.duplicateCount = batch.duplicateCandidates.length
    batch.preview = buildPreview(batch, input)
    batch.previewedAt = nowIso()
    batch.status = 'previewed'
    batch.updatedAt = batch.previewedAt
    await store.save(state)
    return clone(batch.preview)
}

function assertPreviewFresh(batch) {
    if (!batch.preview) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.PREVIEW_EXPIRED, 'Aucune preview active pour ce batch.', {batchId: batch.id})
    if (Date.parse(batch.preview.expiresAt) < Date.now()) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.PREVIEW_EXPIRED, 'La preview a expiré. Relance une preview avant application.', {batchId: batch.id})
}

function validateDecision(decision, row) {
    if (!row) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.INVALID_DECISION, 'La décision cible une ligne inexistante.', {field: 'normalizedRowId'})
    if (['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(decision.kind) && !decision.targetEntityId) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.INVALID_DECISION, 'Cette décision doit cibler une entité existante.', {field: 'targetEntityId', rowNumber: row.rowNumber})
    if (!decision.reason) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.INVALID_DECISION, 'La décision doit conserver une raison lisible.', {field: 'reason', rowNumber: row.rowNumber})
}

async function applyImport(store, input = {}) {
    const {state, batch} = await getBatchOrThrow(store, input.batchId)
    assertPreviewFresh(batch)
    const previewRows = batch.preview.rows
    const incomingDecisions = input.decisions?.length ? input.decisions : previewRows.map((row) => defaultDecisionForPreviewRow(row, batch.id))
    const seenRows = new Set()
    const rowIndex = new Map(batch.normalizedRows.map((row) => [String(row.id), row]))
    const appliedLinks = []
    const decisions = []

    for (const decision of incomingDecisions) {
        const rowKey = String(decision.normalizedRowId)
        if (seenRows.has(rowKey)) throw new ImportWorkflowServiceError(IMPORT_WORKFLOW_ERROR_CODES.DECISION_CONFLICT, 'Plusieurs décisions ciblent la même ligne.', {field: 'normalizedRowId', batchId: batch.id})
        seenRows.add(rowKey)
        const row = rowIndex.get(rowKey)
        validateDecision(decision, row)
        const appliedAt = nowIso()
        const finalDecision = {...decision, status: decision.kind === 'needsManualReview' ? 'validated' : 'applied', updatedAt: appliedAt, history: [...(decision.history || []), {at: appliedAt, actor: decision.decidedBy || 'system', status: decision.kind === 'needsManualReview' ? 'validated' : 'applied', message: decision.reason, metadata: {kind: decision.kind}}]}
        decisions.push(finalDecision)
        if (decision.kind === 'needsManualReview') continue
        const previewRow = previewRows.find((entry) => String(entry.rowId) === rowKey)
        const entityType = previewRow?.targetEntityType === 'investmentMovement' || previewRow?.targetEntityType === 'asset' ? 'asset' : 'transaction'
        const entityId = decision.targetEntityId || makeId(entityType)
        const operation = decision.kind === 'importAsNew' ? 'created' : decision.kind === 'updateExisting' ? 'updated' : decision.kind === 'linkToExisting' ? 'linked' : 'skipped'
        const link = {
            id: makeId('link'),
            batchId: batch.id,
            normalizedRowId: row.id,
            decisionId: finalDecision.id,
            entityType,
            operation,
            transactionId: entityType === 'transaction' ? entityId : undefined,
            assetId: entityType === 'asset' ? entityId : undefined,
            entitySnapshot: {row: row.normalizedData, decisionKind: decision.kind},
            appliedAt,
        }
        appliedLinks.push(link)
        if (operation === 'created') state.existingRows.push({...row, entityId, normalizedHash: normalizedHash(row), fileHash: batch.fileHash})
    }

    batch.decisions = [...(batch.decisions || []), ...decisions]
    batch.appliedLinks = [...(batch.appliedLinks || []), ...appliedLinks]
    batch.appliedAt = nowIso()
    batch.status = decisions.some((decision) => decision.status === 'validated') ? 'partiallyApplied' : 'applied'
    batch.updatedAt = batch.appliedAt
    state.appliedLinks = [...(state.appliedLinks || []), ...appliedLinks]
    await store.save(state)
    return {batch: clone(batch), appliedLinks, decisions}
}

async function cancelImport(store, batchId, reason = null) {
    const {state, batch} = await getBatchOrThrow(store, batchId)
    batch.status = 'cancelled'
    batch.cancelledAt = nowIso()
    batch.cancelReason = reason
    batch.updatedAt = batch.cancelledAt
    await store.save(state)
    return clone(batch)
}

async function listImportHistory(store, filters = {}) {
    const state = await store.load()
    return clone((state.batches || [])
        .filter((batch) => !filters.status || batch.status === filters.status)
        .map((batch) => ({id: batch.id, status: batch.status, importType: batch.importType, provider: batch.provider, fileName: batch.fileName, rowCount: batch.rowCount, errorCount: batch.errorCount, duplicateCount: batch.duplicateCount, importedAt: batch.importedAt, parsedAt: batch.parsedAt, previewedAt: batch.previewedAt, appliedAt: batch.appliedAt, cancelledAt: batch.cancelledAt}))
        .sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt))))
}

async function getImportDetail(store, batchId) {
    const {batch} = await getBatchOrThrow(store, batchId)
    return clone(batch)
}

async function listImportErrors(store, batchId) {
    const {batch} = await getBatchOrThrow(store, batchId)
    return clone(batch.errors || [])
}

async function listDuplicateCandidates(store, batchId) {
    const {batch} = await getBatchOrThrow(store, batchId)
    return clone(batch.duplicateCandidates || [])
}

async function applyReconciliationDecisions(store, input = {}) {
    return applyImport(store, input)
}

function toImportWorkflowIpcError(error) {
    if (error instanceof ImportWorkflowServiceError) {
        return {code: error.code, message: error.message, field: error.field, batchId: error.batchId, rowNumber: error.rowNumber, details: error.details, recoverable: error.recoverable}
    }
    return {code: 'unknownImportWorkflowError', message: error?.message || 'Erreur inconnue pendant le workflow d’import.', field: null, batchId: null, rowNumber: null, details: null, recoverable: false}
}

module.exports = {
    IMPORT_WORKFLOW_ERROR_CODES,
    ImportWorkflowServiceError,
    applyImport,
    applyReconciliationDecisions,
    cancelImport,
    createFileImportWorkflowStore,
    createImportBatch,
    createMemoryImportWorkflowStore,
    defaultImportWorkflowStore,
    getImportDetail,
    listDuplicateCandidates,
    listImportErrors,
    listImportHistory,
    parseImportFile,
    previewImport,
    toImportWorkflowIpcError,
}
