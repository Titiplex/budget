import type {DataFreshnessStatus, DataProvenance} from '../types/provenance'
import {
    calculateDataFreshness,
    provenanceFromBackupRestore,
    provenanceFromCalculation,
    provenanceFromImportBatch,
    provenanceFromMarketData,
    withFreshness,
} from './provenance'

export interface ProvenanceEnvelope<T> {
    value: T
    provenance: DataProvenance
    freshnessStatus: DataFreshnessStatus
}

export function attachImportedTransactionProvenance<T extends Record<string, unknown>>(
    transaction: T,
    batch: {
        id?: string | number | null
        provider?: string | null
        fileName?: string | null
        importedAt?: string | Date | null
        appliedAt?: string | Date | null
        createdAt?: string | Date | null
        updatedAt?: string | Date | null
    },
): ProvenanceEnvelope<T> {
    const provenance = provenanceFromImportBatch(batch)
    return {
        value: transaction,
        provenance,
        freshnessStatus: calculateDataFreshness({origin: provenance.origin, observedAt: provenance.observedAt, staleAfter: provenance.staleAfter}),
    }
}

export function attachBackupRestoreProvenance<T extends Record<string, unknown>>(
    value: T,
    restore: {
        filePath?: string | null
        exportedAt?: string | Date | null
        restoredAt?: string | Date | null
        integrityStatus?: string | null
    },
): ProvenanceEnvelope<T> {
    const provenance = provenanceFromBackupRestore(restore)
    return {
        value,
        provenance,
        freshnessStatus: calculateDataFreshness({origin: provenance.origin, observedAt: provenance.observedAt, staleAfter: provenance.staleAfter}),
    }
}

export function attachMarketSnapshotProvenance<T extends {
    provider?: string | null
    symbol?: string | null
    exchange?: string | null
    pricedAt?: string | Date | null
    retrievedAt?: string | Date | null
    staleAfterHours?: number | null
}>(snapshot: T, now?: string | Date): ProvenanceEnvelope<T> {
    const provenance = provenanceFromMarketData({
        provider: snapshot.provider,
        symbol: snapshot.symbol,
        exchange: snapshot.exchange,
        pricedAt: snapshot.pricedAt,
        retrievedAt: snapshot.retrievedAt,
        staleAfterHours: snapshot.staleAfterHours,
    })
    return {
        value: snapshot,
        provenance,
        freshnessStatus: withFreshness(provenance, now || null).freshnessStatus,
    }
}

export function attachValuationProvenance<T extends Record<string, unknown>>(
    valuation: T,
    input: {
        sourceLabel?: string | null
        calculatedAt?: string | Date | null
        snapshotPricedAt?: string | Date | null
        provider?: string | null
        staleAfterHours?: number | null
        confidence?: DataProvenance['confidence']
    } = {},
    now?: string | Date,
): ProvenanceEnvelope<T> {
    const provenance = input.provider || input.snapshotPricedAt
        ? provenanceFromMarketData({
            provider: input.provider,
            symbol: input.sourceLabel,
            pricedAt: input.snapshotPricedAt || input.calculatedAt || null,
            retrievedAt: input.calculatedAt || null,
            staleAfterHours: input.staleAfterHours ?? 24,
            confidence: input.confidence ?? 'medium',
        })
        : provenanceFromCalculation({
            sourceLabel: input.sourceLabel || 'Valuation',
            calculatedAt: input.calculatedAt || null,
            staleAfter: input.staleAfterHours ? `${input.staleAfterHours}h` : null,
            confidence: input.confidence ?? 'medium',
        })

    return {
        value: valuation,
        provenance,
        freshnessStatus: withFreshness(provenance, now || null).freshnessStatus,
    }
}

export function attachProjectionProvenance<T extends Record<string, unknown>>(
    projection: T,
    input: {
        scenarioId?: string | number | null
        goalId?: string | number | null
        calculatedAt?: string | Date | null
        staleAfter?: string | number | null
        confidence?: DataProvenance['confidence']
    } = {},
    now?: string | Date,
): ProvenanceEnvelope<T> {
    const provenance = provenanceFromCalculation({
        sourceLabel: 'Goal projection',
        calculatedAt: input.calculatedAt || null,
        staleAfter: input.staleAfter ?? '30d',
        confidence: input.confidence ?? 'medium',
        metadata: {
            scenarioId: input.scenarioId ?? null,
            goalId: input.goalId ?? null,
        },
    })

    return {
        value: projection,
        provenance,
        freshnessStatus: withFreshness(provenance, now || null).freshnessStatus,
    }
}
