import type {
    DataFreshnessInput,
    DataFreshnessStatus,
    DataOrigin,
    DataProvenance,
    ProvenanceSourceType,
} from '../types/provenance'

export const DATA_ORIGINS: readonly DataOrigin[] = [
    'manual',
    'csvImport',
    'backupRestore',
    'generatedFromRecurring',
    'calculated',
    'marketDataProvider',
    'connectorReadOnly',
    'migration',
]

export const DATA_FRESHNESS_STATUSES: readonly DataFreshnessStatus[] = [
    'fresh',
    'stale',
    'unknown',
    'userProvided',
    'unavailable',
]

const ORIGIN_TO_SOURCE_TYPE: Record<DataOrigin, ProvenanceSourceType> = {
    manual: 'user',
    csvImport: 'csvFile',
    backupRestore: 'backupFile',
    generatedFromRecurring: 'recurringTemplate',
    calculated: 'calculation',
    marketDataProvider: 'marketDataProvider',
    connectorReadOnly: 'connector',
    migration: 'migration',
}

const SECRET_KEYS = /secret|password|token|api[-_]?key|authorization|credential/i

type DataProvenanceInput = Omit<Partial<DataProvenance>, 'createdAt' | 'updatedAt' | 'observedAt' | 'metadata'> & {
    origin: DataOrigin
    createdAt?: string | Date | null
    updatedAt?: string | Date | null
    observedAt?: string | Date | null
    metadata?: Record<string, unknown>
}

function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function toIso(value: string | Date | null | undefined): string | null {
    return toDate(value)?.toISOString() || null
}

function parseStaleAfterMs(value: string | number | null | undefined): number | null {
    if (value == null || value === '') return null
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
    const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i)
    if (!match) return null
    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) return null
    const unit = match[2].toLowerCase()
    if (unit === 'ms') return amount
    if (unit === 's') return amount * 1000
    if (unit === 'm') return amount * 60 * 1000
    if (unit === 'h') return amount * 60 * 60 * 1000
    return amount * 24 * 60 * 60 * 1000
}

export function sanitizeProvenanceMetadata(metadata: Record<string, unknown> = {}): DataProvenance['metadata'] {
    const sanitized: DataProvenance['metadata'] = {}
    for (const [key, value] of Object.entries(metadata)) {
        if (SECRET_KEYS.test(key)) continue
        if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            sanitized[key] = value as string | number | boolean | null
        }
    }
    return sanitized
}

export function inferSourceType(origin: DataOrigin): ProvenanceSourceType {
    return ORIGIN_TO_SOURCE_TYPE[origin]
}

export function calculateDataFreshness(input: DataFreshnessInput = {}): DataFreshnessStatus {
    if (input.unavailable) return 'unavailable'
    if (input.origin === 'manual') return 'userProvided'

    const observedAt = toDate(input.observedAt)
    if (!observedAt) return 'unknown'

    const staleAfterMs = parseStaleAfterMs(input.staleAfter)
    if (!staleAfterMs) return 'unknown'

    const now = toDate(input.now) || new Date()
    return now.getTime() - observedAt.getTime() <= staleAfterMs ? 'fresh' : 'stale'
}

export function createDataProvenance(input: DataProvenanceInput): DataProvenance {
    const now = new Date().toISOString()
    const createdAt = toIso(input.createdAt) || now
    const updatedAt = toIso(input.updatedAt) || createdAt

    return {
        origin: input.origin,
        sourceType: input.sourceType || inferSourceType(input.origin),
        sourceLabel: input.sourceLabel ?? null,
        importBatchId: input.importBatchId ?? null,
        provider: input.provider ?? null,
        createdAt,
        updatedAt,
        observedAt: toIso(input.observedAt) || null,
        staleAfter: input.staleAfter ?? null,
        confidence: input.confidence ?? null,
        metadata: sanitizeProvenanceMetadata(input.metadata || {}),
    }
}

export function withFreshness(provenance: DataProvenance, now: string | Date | null = null): DataProvenance & {freshnessStatus: DataFreshnessStatus} {
    return {
        ...provenance,
        freshnessStatus: calculateDataFreshness({
            origin: provenance.origin,
            observedAt: provenance.observedAt,
            staleAfter: provenance.staleAfter,
            now,
        }),
    }
}

export function provenanceFromImportBatch(batch: {
    id?: string | number | null
    provider?: string | null
    fileName?: string | null
    importedAt?: string | Date | null
    appliedAt?: string | Date | null
    createdAt?: string | Date | null
    updatedAt?: string | Date | null
}): DataProvenance {
    return createDataProvenance({
        origin: 'csvImport',
        sourceType: 'csvFile',
        sourceLabel: batch.fileName || batch.provider || 'Import CSV',
        importBatchId: batch.id ?? null,
        provider: batch.provider ?? null,
        createdAt: batch.createdAt || batch.importedAt || null,
        updatedAt: batch.updatedAt || batch.appliedAt || batch.importedAt || null,
        observedAt: batch.appliedAt || batch.importedAt || null,
        confidence: 'medium',
        metadata: {fileName: batch.fileName ?? null},
    })
}

export function provenanceFromBackupRestore(input: {
    filePath?: string | null
    exportedAt?: string | Date | null
    restoredAt?: string | Date | null
    integrityStatus?: string | null
} = {}): DataProvenance {
    return createDataProvenance({
        origin: 'backupRestore',
        sourceType: 'backupFile',
        sourceLabel: input.filePath || 'Backup restore',
        createdAt: input.restoredAt || null,
        updatedAt: input.restoredAt || null,
        observedAt: input.exportedAt || null,
        confidence: input.integrityStatus === 'valid' ? 'high' : 'medium',
        metadata: {integrityStatus: input.integrityStatus ?? null},
    })
}

export function provenanceFromMarketData(input: {
    provider?: string | null
    symbol?: string | null
    exchange?: string | null
    pricedAt?: string | Date | null
    retrievedAt?: string | Date | null
    staleAfterHours?: number | null
    confidence?: DataProvenance['confidence']
}): DataProvenance {
    return createDataProvenance({
        origin: 'marketDataProvider',
        sourceType: 'marketDataProvider',
        sourceLabel: input.symbol || input.provider || 'Market data',
        provider: input.provider ?? null,
        createdAt: input.retrievedAt || null,
        updatedAt: input.retrievedAt || null,
        observedAt: input.pricedAt || input.retrievedAt || null,
        staleAfter: input.staleAfterHours ? `${input.staleAfterHours}h` : null,
        confidence: input.confidence ?? 'medium',
        metadata: {symbol: input.symbol ?? null, exchange: input.exchange ?? null},
    })
}

export function provenanceFromCalculation(input: {
    sourceLabel?: string | null
    calculatedAt?: string | Date | null
    staleAfter?: string | number | null
    confidence?: DataProvenance['confidence']
    metadata?: Record<string, unknown>
} = {}): DataProvenance {
    return createDataProvenance({
        origin: 'calculated',
        sourceType: 'calculation',
        sourceLabel: input.sourceLabel || 'Calculated value',
        createdAt: input.calculatedAt || null,
        updatedAt: input.calculatedAt || null,
        observedAt: input.calculatedAt || null,
        staleAfter: input.staleAfter ?? null,
        confidence: input.confidence ?? 'medium',
        metadata: input.metadata || {},
    })
}
