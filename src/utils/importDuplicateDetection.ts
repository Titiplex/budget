import {ImportDeduplicationStrategy, ImportTargetEntityType} from '../types/imports'
import type {ImportDuplicateCandidate, ImportEntityId, ImportRowNormalized, JsonObject} from '../types/imports'

export type ImportDuplicateMatchKind = 'exactDuplicate' | 'probableDuplicate' | 'weakCollision' | 'notDuplicate'
export type ImportDuplicateSource = 'normalizedHash' | 'externalId' | 'existingEntity' | 'sameBatch' | 'previousBatch'

export interface ImportDuplicateDetectionThresholds {
    exact: number
    probable: number
    weak: number
}

export interface ImportDuplicateDetectionOptions {
    thresholds?: Partial<ImportDuplicateDetectionThresholds>
    repeatedFileHash?: string | null
    includeSameBatchCandidates?: boolean
    labelSimilarityWeight?: number
}

interface ResolvedImportDuplicateDetectionOptions {
    thresholds: ImportDuplicateDetectionThresholds
    repeatedFileHash: string | null
    includeSameBatchCandidates: boolean
    labelSimilarityWeight: number
}

export interface ImportDuplicateReference {
    id: ImportEntityId
    entityType: ImportTargetEntityType
    normalizedHash?: string | null
    externalRef?: string | null
    fileHash?: string | null
    date?: string | null
    amount?: number | null
    currency?: string | null
    accountName?: string | null
    sourceName?: string | null
    label?: string | null
    symbol?: string | null
    quantity?: number | null
    unitPrice?: number | null
    fees?: number | null
    snapshot?: JsonObject | null
}

export interface ImportDuplicateDetectionCandidate extends ImportDuplicateCandidate {
    matchKind: ImportDuplicateMatchKind
    source: ImportDuplicateSource
    scoreBreakdown: Record<string, number>
    normalizedHash?: string | null
}

export interface ImportDuplicateDetectionRowResult {
    rowId?: ImportEntityId | null
    rowNumber: number
    normalizedHash: string
    matchKind: ImportDuplicateMatchKind
    confidence: number
    candidates: ImportDuplicateDetectionCandidate[]
}

export interface ImportDuplicateDetectionResult {
    thresholds: ImportDuplicateDetectionThresholds
    rows: ImportDuplicateDetectionRowResult[]
    candidates: ImportDuplicateDetectionCandidate[]
    exactDuplicates: ImportDuplicateDetectionCandidate[]
    probableDuplicates: ImportDuplicateDetectionCandidate[]
    weakCollisions: ImportDuplicateDetectionCandidate[]
    rowsWithCandidates: Array<ImportRowNormalized<JsonObject>>
}

const DEFAULT_THRESHOLDS: ImportDuplicateDetectionThresholds = {exact: 0.98, probable: 0.82, weak: 0.55}
const LABEL_STOPWORDS = new Set(['the', 'and', 'of', 'for', 'payment', 'purchase', 'transaction', 'card', 'debit', 'credit', 'le', 'la', 'les', 'des', 'du', 'de', 'paiement', 'achat', 'transaction', 'carte'])

type DuplicateScore = {
    confidence: number
    matchKind: ImportDuplicateMatchKind
    source: ImportDuplicateSource
    scoreBreakdown: Record<string, number>
    normalizedHash: string
}

function getData(row: ImportRowNormalized<JsonObject>) {
    return row.normalizedData || {}
}

function asString(value: unknown) {
    return String(value ?? '').trim()
}

function asIsoDay(value: unknown) {
    const raw = asString(value)
    return raw ? raw.slice(0, 10) : ''
}

function asNumber(value: unknown) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function roundNumber(value: unknown, precision = 6) {
    const parsed = asNumber(value)
    return parsed == null ? null : Number(parsed.toFixed(precision))
}

function normalizeCurrency(value: unknown) {
    return asString(value).toUpperCase()
}

function normalizeSymbol(value: unknown) {
    return asString(value).toUpperCase()
}

function normalizeLooseText(value: unknown) {
    return asString(value)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((token) => token && !LABEL_STOPWORDS.has(token))
        .join(' ')
}

function compactObject(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== '' && entry !== null && entry !== undefined))
}

function stableStringify(value: unknown): string {
    if (value == null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
    return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
        .join(',')}}`
}

function hashString(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildImportNormalizedFingerprint(row: ImportRowNormalized<JsonObject>) {
    const data = getData(row)
    return compactObject({
        externalRef: asString(row.externalRef || data.externalRef),
        date: asIsoDay(row.transactionDate || data.date),
        amount: roundNumber(row.amount ?? data.amount, 2),
        currency: normalizeCurrency(row.currency || data.currency),
        accountName: normalizeLooseText(row.accountName || data.accountName),
        sourceName: normalizeLooseText(data.sourceName),
        label: normalizeLooseText(row.label || data.label),
        symbol: normalizeSymbol(data.symbol),
        quantity: roundNumber(data.quantity, 6),
        unitPrice: roundNumber(data.unitPrice, 6),
        fees: roundNumber(data.fees, 2),
    })
}

export function hashImportNormalizedRow(row: ImportRowNormalized<JsonObject>) {
    return hashString(stableStringify(buildImportNormalizedFingerprint(row)))
}

function referenceFingerprint(reference: ImportDuplicateReference) {
    return compactObject({
        externalRef: asString(reference.externalRef),
        date: asIsoDay(reference.date),
        amount: roundNumber(reference.amount, 2),
        currency: normalizeCurrency(reference.currency),
        accountName: normalizeLooseText(reference.accountName),
        sourceName: normalizeLooseText(reference.sourceName),
        label: normalizeLooseText(reference.label),
        symbol: normalizeSymbol(reference.symbol),
        quantity: roundNumber(reference.quantity, 6),
        unitPrice: roundNumber(reference.unitPrice, 6),
        fees: roundNumber(reference.fees, 2),
    })
}

export function importRowToDuplicateReference(row: ImportRowNormalized<JsonObject>, id: ImportEntityId = row.id ?? `row:${row.rowNumber}`): ImportDuplicateReference {
    const data = getData(row)
    return {
        id,
        entityType: row.targetKind || ImportTargetEntityType.Transaction,
        normalizedHash: hashImportNormalizedRow(row),
        externalRef: asString(row.externalRef || data.externalRef) || null,
        date: asIsoDay(row.transactionDate || data.date) || null,
        amount: asNumber(row.amount ?? data.amount),
        currency: normalizeCurrency(row.currency || data.currency) || null,
        accountName: asString(row.accountName || data.accountName) || null,
        sourceName: asString(data.sourceName) || null,
        label: asString(row.label || data.label) || null,
        symbol: asString(data.symbol) || null,
        quantity: asNumber(data.quantity),
        unitPrice: asNumber(data.unitPrice),
        fees: asNumber(data.fees),
        snapshot: data,
    }
}

function levenshtein(left: string, right: string) {
    if (left === right) return 0
    if (!left.length) return right.length
    if (!right.length) return left.length
    const previous = Array.from({length: right.length + 1}, (_, index) => index)
    const current = Array.from({length: right.length + 1}, () => 0)
    for (let i = 1; i <= left.length; i += 1) {
        current[0] = i
        for (let j = 1; j <= right.length; j += 1) {
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1))
        }
        previous.splice(0, previous.length, ...current)
    }
    return previous[right.length]
}

function textSimilarity(left: string, right: string) {
    const a = normalizeLooseText(left)
    const b = normalizeLooseText(right)
    if (!a && !b) return 0
    if (a === b) return 1
    const leftTokens = new Set(a.split(/\s+/).filter(Boolean))
    const rightTokens = new Set(b.split(/\s+/).filter(Boolean))
    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
    const union = new Set([...leftTokens, ...rightTokens]).size || 1
    const tokenScore = intersection / union
    const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1)
    return Math.max(0, Math.min(1, tokenScore * 0.6 + editScore * 0.4))
}

function numberClose(left: unknown, right: unknown, tolerance = 0.01) {
    const a = asNumber(left)
    const b = asNumber(right)
    if (a == null || b == null) return 0
    const delta = Math.abs(a - b)
    if (delta <= tolerance) return 1
    return delta / Math.max(Math.abs(a), Math.abs(b), 1) <= 0.01 ? 0.7 : 0
}

function sameDay(left: unknown, right: unknown) {
    const a = asIsoDay(left)
    const b = asIsoDay(right)
    if (!a || !b) return 0
    if (a === b) return 1
    const leftTime = Date.parse(a)
    const rightTime = Date.parse(b)
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0
    return Math.abs(leftTime - rightTime) / 86_400_000 <= 1 ? 0.55 : 0
}

function sameText(left: unknown, right: unknown) {
    const a = normalizeLooseText(left)
    const b = normalizeLooseText(right)
    return a && b && a === b ? 1 : 0
}

function sameUpper(left: unknown, right: unknown) {
    const a = asString(left).toUpperCase()
    const b = asString(right).toUpperCase()
    return a && b && a === b ? 1 : 0
}

function classify(confidence: number, thresholds: ImportDuplicateDetectionThresholds): ImportDuplicateMatchKind {
    if (confidence >= thresholds.exact) return 'exactDuplicate'
    if (confidence >= thresholds.probable) return 'probableDuplicate'
    if (confidence >= thresholds.weak) return 'weakCollision'
    return 'notDuplicate'
}

function scoreDuplicate(row: ImportRowNormalized<JsonObject>, reference: ImportDuplicateReference, options: ResolvedImportDuplicateDetectionOptions): DuplicateScore {
    const thresholds = options.thresholds
    const fingerprint = buildImportNormalizedFingerprint(row)
    const referenceHash = reference.normalizedHash || hashString(stableStringify(referenceFingerprint(reference)))
    const rowHash = hashImportNormalizedRow(row)
    const rowExternalRef = asString(row.externalRef || getData(row).externalRef)
    const referenceExternalRef = asString(reference.externalRef)

    if (rowExternalRef && referenceExternalRef && rowExternalRef === referenceExternalRef) {
        return {confidence: 1, matchKind: 'exactDuplicate', source: 'externalId', scoreBreakdown: {externalRef: 1}, normalizedHash: rowHash}
    }
    if (referenceHash && rowHash === referenceHash) {
        return {confidence: 1, matchKind: 'exactDuplicate', source: 'normalizedHash', scoreBreakdown: {normalizedHash: 1}, normalizedHash: rowHash}
    }

    const rowData = getData(row)
    const scoreBreakdown = {
        date: sameDay(row.transactionDate || rowData.date, reference.date),
        amount: numberClose(row.amount ?? rowData.amount, reference.amount),
        currency: sameUpper(row.currency || rowData.currency, reference.currency),
        accountOrSource: Math.max(sameText(row.accountName || rowData.accountName, reference.accountName), sameText(rowData.sourceName, reference.sourceName)),
        label: textSimilarity(asString(row.label || rowData.label), asString(reference.label)),
        symbol: sameUpper(rowData.symbol, reference.symbol),
        quantity: numberClose(rowData.quantity, reference.quantity, 0.000001),
        unitPrice: numberClose(rowData.unitPrice, reference.unitPrice, 0.000001),
        fees: numberClose(rowData.fees, reference.fees, 0.01),
    }
    const hasInvestmentSignal = Boolean(fingerprint.symbol || fingerprint.quantity || fingerprint.unitPrice)
    const weights = hasInvestmentSignal
        ? {date: 0.18, amount: 0.14, currency: 0.08, accountOrSource: 0.08, label: options.labelSimilarityWeight, symbol: 0.18, quantity: 0.16, unitPrice: 0.12, fees: 0.04}
        : {date: 0.24, amount: 0.26, currency: 0.1, accountOrSource: 0.12, label: options.labelSimilarityWeight, symbol: 0, quantity: 0, unitPrice: 0, fees: 0.04}
    const totalWeight = Object.entries(weights).filter(([key]) => scoreBreakdown[key as keyof typeof scoreBreakdown] > 0).reduce((sum, [, weight]) => sum + weight, 0)
    const weightedScore = Object.entries(weights).reduce((sum, [key, weight]) => sum + scoreBreakdown[key as keyof typeof scoreBreakdown] * weight, 0)
    const confidence = totalWeight > 0 ? Math.min(1, weightedScore / Math.max(totalWeight, 0.65)) : 0
    const roundedConfidence = Number(confidence.toFixed(4))
    return {confidence: roundedConfidence, matchKind: classify(roundedConfidence, thresholds), source: 'existingEntity', scoreBreakdown, normalizedHash: rowHash}
}

function reasonFor(matchKind: ImportDuplicateMatchKind, source: ImportDuplicateSource, confidence: number) {
    if (matchKind === 'exactDuplicate' && source === 'normalizedHash') return 'Même hash de ligne normalisée.'
    if (matchKind === 'exactDuplicate' && source === 'externalId') return 'Même identifiant externe.'
    if (matchKind === 'exactDuplicate') return 'Signaux identiques; doublon exact.'
    if (matchKind === 'probableDuplicate') return `Signaux proches; doublon probable (${Math.round(confidence * 100)}%).`
    if (matchKind === 'weakCollision') return `Collision faible à vérifier (${Math.round(confidence * 100)}%).`
    return 'Non-doublon.'
}

function toCandidate(row: ImportRowNormalized<JsonObject>, reference: ImportDuplicateReference, score: DuplicateScore): ImportDuplicateDetectionCandidate {
    return {
        normalizedRowId: row.id,
        entityType: reference.entityType,
        entityId: reference.id,
        confidence: score.confidence,
        strategy: score.matchKind === 'exactDuplicate' ? ImportDeduplicationStrategy.Strict : score.matchKind === 'probableDuplicate' ? ImportDeduplicationStrategy.Fuzzy : ImportDeduplicationStrategy.ManualReview,
        reason: reasonFor(score.matchKind, score.source, score.confidence),
        matchFields: Object.entries(score.scoreBreakdown).filter(([, value]) => value > 0).map(([key]) => key),
        candidateSnapshot: reference.snapshot || referenceFingerprint(reference),
        matchKind: score.matchKind,
        source: score.source,
        scoreBreakdown: score.scoreBreakdown,
        normalizedHash: score.normalizedHash,
    }
}

function normalizedOptions(options: ImportDuplicateDetectionOptions): ResolvedImportDuplicateDetectionOptions {
    return {
        thresholds: {...DEFAULT_THRESHOLDS, ...(options.thresholds || {})},
        repeatedFileHash: options.repeatedFileHash ?? null,
        includeSameBatchCandidates: options.includeSameBatchCandidates ?? true,
        labelSimilarityWeight: options.labelSimilarityWeight ?? 0.18,
    }
}

export function detectImportDuplicateCandidates(rows: Array<ImportRowNormalized<JsonObject>>, references: ImportDuplicateReference[] = [], options: ImportDuplicateDetectionOptions = {}): ImportDuplicateDetectionResult {
    const resolvedOptions = normalizedOptions(options)
    const rowResults: ImportDuplicateDetectionRowResult[] = []
    const allCandidates: ImportDuplicateDetectionCandidate[] = []
    const sameBatchReferences: ImportDuplicateReference[] = []

    for (const row of rows) {
        const candidates: ImportDuplicateDetectionCandidate[] = []
        const referencesToCheck = [...references, ...(resolvedOptions.includeSameBatchCandidates ? sameBatchReferences : [])]
        for (const reference of referencesToCheck) {
            const score = scoreDuplicate(row, reference, resolvedOptions)
            if (score.matchKind === 'notDuplicate') continue
            const candidate = toCandidate(row, reference, score)
            if (reference.fileHash && resolvedOptions.repeatedFileHash && reference.fileHash === resolvedOptions.repeatedFileHash && candidate.confidence >= resolvedOptions.thresholds.probable) {
                candidate.confidence = Math.max(candidate.confidence, resolvedOptions.thresholds.exact)
                candidate.matchKind = 'exactDuplicate'
                candidate.source = 'previousBatch'
                candidate.reason = 'Même fichier déjà importé; doublon exact très probable.'
            }
            candidates.push(candidate)
        }
        candidates.sort((left, right) => right.confidence - left.confidence)
        const top = candidates[0]
        const normalizedHash = hashImportNormalizedRow(row)
        rowResults.push({rowId: row.id ?? null, rowNumber: row.rowNumber, normalizedHash, matchKind: top?.matchKind || 'notDuplicate', confidence: top?.confidence || 0, candidates})
        allCandidates.push(...candidates)
        sameBatchReferences.push(importRowToDuplicateReference(row, row.id ?? `sameBatch:${row.rowNumber}`))
    }

    const rowsWithCandidates = rows.map((row) => {
        const result = rowResults.find((entry) => String(entry.rowId ?? '') === String(row.id ?? '') && entry.rowNumber === row.rowNumber)
        return {
            ...row,
            duplicateCandidates: [...(row.duplicateCandidates || []), ...(result?.candidates || [])],
            duplicateKey: row.duplicateKey || result?.normalizedHash || null,
            duplicateConfidence: result?.confidence || row.duplicateConfidence || null,
        }
    })

    return {
        thresholds: resolvedOptions.thresholds,
        rows: rowResults,
        candidates: allCandidates,
        exactDuplicates: allCandidates.filter((candidate) => candidate.matchKind === 'exactDuplicate'),
        probableDuplicates: allCandidates.filter((candidate) => candidate.matchKind === 'probableDuplicate'),
        weakCollisions: allCandidates.filter((candidate) => candidate.matchKind === 'weakCollision'),
        rowsWithCandidates,
    }
}
