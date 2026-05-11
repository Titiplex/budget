import {describe, expect, it} from 'vitest'
import {
    calculateDataFreshness,
    createDataProvenance,
    provenanceFromBackupRestore,
    provenanceFromCalculation,
    provenanceFromImportBatch,
    provenanceFromMarketData,
    sanitizeProvenanceMetadata,
    withFreshness,
} from '../../utils/provenance'

describe('data provenance helpers', () => {
    it('calculates fresh, stale, unknown, user provided and unavailable states', () => {
        expect(calculateDataFreshness({
            origin: 'marketDataProvider',
            observedAt: '2026-05-11T10:00:00.000Z',
            staleAfter: '4h',
            now: '2026-05-11T12:00:00.000Z',
        })).toBe('fresh')

        expect(calculateDataFreshness({
            origin: 'marketDataProvider',
            observedAt: '2026-05-10T10:00:00.000Z',
            staleAfter: '4h',
            now: '2026-05-11T12:00:00.000Z',
        })).toBe('stale')

        expect(calculateDataFreshness({origin: 'marketDataProvider', observedAt: null, staleAfter: '4h'})).toBe('unknown')
        expect(calculateDataFreshness({origin: 'manual', observedAt: '2020-01-01T00:00:00.000Z', staleAfter: '1h'})).toBe('userProvided')
        expect(calculateDataFreshness({unavailable: true})).toBe('unavailable')
    })

    it('creates generic provenance with inferred source type and sanitized metadata', () => {
        const provenance = createDataProvenance({
            origin: 'csvImport',
            sourceLabel: 'bank.csv',
            importBatchId: 42,
            provider: 'bank-a',
            createdAt: '2026-05-11T10:00:00.000Z',
            observedAt: '2026-05-11T10:00:00.000Z',
            staleAfter: '30d',
            confidence: 'high',
            metadata: {
                fileHash: 'abc',
                apiKey: 'must-not-leak',
                nested: {secret: true},
                rowCount: 3,
            },
        })

        expect(provenance).toMatchObject({
            origin: 'csvImport',
            sourceType: 'csvFile',
            sourceLabel: 'bank.csv',
            importBatchId: 42,
            provider: 'bank-a',
            confidence: 'high',
            metadata: {fileHash: 'abc', rowCount: 3},
        })
        expect(Object.keys(provenance.metadata)).not.toContain('apiKey')
        expect(Object.keys(provenance.metadata)).not.toContain('nested')
    })

    it('builds provenance for imports, restores, market data and calculations', () => {
        expect(provenanceFromImportBatch({
            id: 'batch-1',
            provider: 'bank-a',
            fileName: 'checking.csv',
            importedAt: '2026-05-10T10:00:00.000Z',
            appliedAt: '2026-05-10T10:05:00.000Z',
        })).toMatchObject({
            origin: 'csvImport',
            sourceType: 'csvFile',
            sourceLabel: 'checking.csv',
            importBatchId: 'batch-1',
            provider: 'bank-a',
        })

        expect(provenanceFromBackupRestore({
            filePath: '/tmp/backup.json',
            exportedAt: '2026-05-01T00:00:00.000Z',
            restoredAt: '2026-05-11T00:00:00.000Z',
            integrityStatus: 'valid',
        })).toMatchObject({origin: 'backupRestore', sourceType: 'backupFile', confidence: 'high'})

        const marketData = withFreshness(provenanceFromMarketData({
            provider: 'fixture-provider',
            symbol: 'AAPL',
            pricedAt: '2026-05-11T10:00:00.000Z',
            staleAfterHours: 24,
        }), '2026-05-11T12:00:00.000Z')
        expect(marketData).toMatchObject({origin: 'marketDataProvider', sourceType: 'marketDataProvider', freshnessStatus: 'fresh'})

        const calculated = withFreshness(provenanceFromCalculation({
            sourceLabel: 'Projection mensuelle',
            calculatedAt: '2026-05-01T00:00:00.000Z',
            staleAfter: '7d',
        }), '2026-05-11T00:00:00.000Z')
        expect(calculated).toMatchObject({origin: 'calculated', sourceType: 'calculation', freshnessStatus: 'stale'})
    })

    it('removes secret-like metadata keys', () => {
        expect(sanitizeProvenanceMetadata({
            token: 'nope',
            password: 'nope',
            authorization: 'nope',
            provider: 'ok',
            confidence: 0.8,
            enabled: true,
        })).toEqual({provider: 'ok', confidence: 0.8, enabled: true})
    })
})
