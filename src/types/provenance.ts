export type DataOrigin =
    | 'manual'
    | 'csvImport'
    | 'backupRestore'
    | 'generatedFromRecurring'
    | 'calculated'
    | 'marketDataProvider'
    | 'connectorReadOnly'
    | 'migration'

export type DataFreshnessStatus =
    | 'fresh'
    | 'stale'
    | 'unknown'
    | 'userProvided'
    | 'unavailable'

export type ProvenanceSourceType =
    | 'user'
    | 'csvFile'
    | 'backupFile'
    | 'recurringTemplate'
    | 'calculation'
    | 'marketDataProvider'
    | 'connector'
    | 'migration'
    | 'system'

export type DataConfidence = 'low' | 'medium' | 'high' | number

export interface DataProvenance {
    origin: DataOrigin
    sourceType: ProvenanceSourceType
    sourceLabel: string | null
    importBatchId: string | number | null
    provider: string | null
    createdAt: string
    updatedAt: string
    observedAt: string | null
    staleAfter: string | number | null
    confidence: DataConfidence | null
    metadata: Record<string, string | number | boolean | null>
}

export interface DataFreshnessInput {
    origin?: DataOrigin | null
    observedAt?: string | Date | null
    staleAfter?: string | number | null
    unavailable?: boolean | null
    now?: string | Date | null
}

export interface DataWithProvenance<T> {
    data: T
    provenance: DataProvenance
    freshnessStatus: DataFreshnessStatus
}
