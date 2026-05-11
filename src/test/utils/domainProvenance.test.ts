import {describe, expect, it} from 'vitest'
import {
    attachBackupRestoreProvenance,
    attachImportedTransactionProvenance,
    attachMarketSnapshotProvenance,
    attachProjectionProvenance,
    attachValuationProvenance,
} from '../../utils/domainProvenance'

describe('domain provenance adapters', () => {
    it('links imported transactions to their import batch without storing secrets', () => {
        const wrapped = attachImportedTransactionProvenance(
            {id: 1, label: 'Coffee'},
            {id: 'batch-1', provider: 'bank-a', fileName: 'bank.csv', importedAt: '2026-05-11T10:00:00.000Z'},
        )

        expect(wrapped.value).toEqual({id: 1, label: 'Coffee'})
        expect(wrapped.provenance).toMatchObject({
            origin: 'csvImport',
            sourceType: 'csvFile',
            sourceLabel: 'bank.csv',
            importBatchId: 'batch-1',
            provider: 'bank-a',
        })
        expect(wrapped.freshnessStatus).toBe('unknown')
    })

    it('marks restored data with backup provenance and integrity confidence', () => {
        const wrapped = attachBackupRestoreProvenance(
            {id: 2, name: 'Main'},
            {filePath: '/tmp/backup.json', exportedAt: '2026-05-01T00:00:00.000Z', restoredAt: '2026-05-11T00:00:00.000Z', integrityStatus: 'valid'},
        )

        expect(wrapped.provenance).toMatchObject({
            origin: 'backupRestore',
            sourceType: 'backupFile',
            sourceLabel: '/tmp/backup.json',
            confidence: 'high',
        })
    })

    it('derives market snapshot freshness from provider observation time', () => {
        const wrapped = attachMarketSnapshotProvenance({
            provider: 'fixture-provider',
            symbol: 'AAPL',
            pricedAt: '2026-05-11T10:00:00.000Z',
            retrievedAt: '2026-05-11T10:01:00.000Z',
            staleAfterHours: 2,
        }, '2026-05-11T11:00:00.000Z')

        expect(wrapped.provenance).toMatchObject({origin: 'marketDataProvider', provider: 'fixture-provider'})
        expect(wrapped.freshnessStatus).toBe('fresh')
    })

    it('marks valuations and projections as calculated or provider-backed', () => {
        const valuation = attachValuationProvenance(
            {marketValue: 100},
            {sourceLabel: 'AAPL', snapshotPricedAt: '2026-05-01T00:00:00.000Z', provider: 'fixture-provider', staleAfterHours: 24},
            '2026-05-11T00:00:00.000Z',
        )
        expect(valuation.provenance.origin).toBe('marketDataProvider')
        expect(valuation.freshnessStatus).toBe('stale')

        const projection = attachProjectionProvenance(
            {projectedValue: 5000},
            {goalId: 7, scenarioId: 3, calculatedAt: '2026-05-11T00:00:00.000Z', staleAfter: '30d'},
            '2026-05-12T00:00:00.000Z',
        )
        expect(projection.provenance).toMatchObject({origin: 'calculated', sourceType: 'calculation'})
        expect(projection.provenance.metadata).toMatchObject({goalId: 7, scenarioId: 3})
        expect(projection.freshnessStatus).toBe('fresh')
    })
})
