import {describe, expect, it} from 'vitest'

const {
    buildInstrumentKey,
    buildInstrumentPayload,
    deterministicMockPrice,
    refreshWatchlist,
    shouldSimulateProviderFailure,
} = require('../../../electron/ipc/marketDataWatchlistHandlers')

function createPrismaMock(instruments) {
    const snapshots = []
    return {
        snapshots,
        marketInstrument: {
            findMany: async () => instruments,
            update: async ({where, data}) => {
                const row = instruments.find((instrument) => instrument.id === where.id)
                if (row) Object.assign(row, data)
                return row
            },
            upsert: async ({create, update, include}) => {
                const existing = instruments.find((instrument) => instrument.instrumentKey === create.instrumentKey)
                if (existing) {
                    Object.assign(existing, update)
                    return {...existing, priceSnapshots: existing.priceSnapshots || []}
                }
                const row = {
                    id: instruments.length + 1,
                    ...create,
                    currentPrice: null,
                    currentPriceCurrency: null,
                    currentPriceQuotedAt: null,
                    currentPriceProvider: null,
                    freshnessStatus: 'UNKNOWN',
                    freshnessCheckedAt: null,
                    createdAt: new Date('2026-04-28T12:00:00.000Z'),
                    updatedAt: new Date('2026-04-28T12:00:00.000Z'),
                    priceSnapshots: include ? [] : undefined,
                }
                instruments.push(row)
                return row
            },
        },
        priceSnapshot: {
            create: async ({data}) => {
                const snapshot = {
                    id: snapshots.length + 1,
                    ...data,
                    createdAt: data.pricedAt,
                    updatedAt: data.pricedAt,
                }
                snapshots.push(snapshot)
                const instrument = instruments.find((row) => row.id === data.marketInstrumentId)
                if (instrument) {
                    instrument.priceSnapshots = [snapshot]
                }
                return snapshot
            },
        },
    }
}

describe('marketDataWatchlistHandlers', () => {
    it('normalizes instrument keys with provider, symbol, exchange and currency', () => {
        expect(buildInstrumentKey({provider: 'Local', symbol: ' aapl ', exchange: ' nasdaq ', quoteCurrency: 'usd'}))
            .toBe('local:AAPL:NASDAQ:USD')
    })

    it('builds a safe Prisma payload for a watchlist instrument', () => {
        expect(buildInstrumentPayload({symbol: 'voo', currency: 'usd', provider: '', instrumentType: 'ETF'}))
            .toMatchObject({
                instrumentKey: 'local:VOO:none:USD',
                symbol: 'VOO',
                quoteCurrency: 'USD',
                provider: 'local',
                instrumentType: 'ETF',
                isActive: true,
            })
    })

    it('generates deterministic mock prices for local refresh', () => {
        expect(deterministicMockPrice('AAPL')).toBe(deterministicMockPrice('aapl'))
        expect(deterministicMockPrice('AAPL')).toBeGreaterThan(0)
    })

    it('marks explicit offline providers as recoverable failures', () => {
        expect(shouldSimulateProviderFailure('offline')).toBe(true)
        expect(shouldSimulateProviderFailure('local')).toBe(false)
    })

    it('refreshes local providers without network dependency', async () => {
        const prisma = createPrismaMock([
            {
                id: 1,
                instrumentKey: 'local:AAPL:none:USD',
                symbol: 'AAPL',
                name: 'Apple',
                instrumentType: 'EQUITY',
                exchange: null,
                quoteCurrency: 'USD',
                provider: 'local',
                isActive: true,
                staleAfterHours: 24,
                priceSnapshots: [],
            },
        ])

        const result = await refreshWatchlist(prisma)

        expect(result.status).toBe('SUCCESS')
        expect(result.summary).toMatchObject({requested: 1, succeeded: 1, failed: 0})
        expect(prisma.snapshots).toHaveLength(1)
    })

    it('keeps the last local snapshot when provider refresh fails', async () => {
        const oldSnapshot = {
            id: 7,
            marketInstrumentId: 1,
            unitPrice: 42,
            currency: 'USD',
            pricedAt: new Date('2026-04-20T10:00:00.000Z'),
            retrievedAt: new Date('2026-04-20T10:00:00.000Z'),
            provider: 'local',
            source: 'API',
            freshnessStatus: 'STALE',
            note: null,
            createdAt: new Date('2026-04-20T10:00:00.000Z'),
            updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        }
        const prisma = createPrismaMock([
            {
                id: 1,
                instrumentKey: 'offline:AAPL:none:USD',
                symbol: 'AAPL',
                name: 'Apple',
                instrumentType: 'EQUITY',
                exchange: null,
                quoteCurrency: 'USD',
                provider: 'offline',
                isActive: true,
                staleAfterHours: 24,
                priceSnapshots: [oldSnapshot],
            },
        ])

        const result = await refreshWatchlist(prisma)

        expect(result.status).toBe('FAILED')
        expect(result.errors[0]).toMatchObject({status: 'PROVIDER_UNAVAILABLE', recoverable: true})
        expect(prisma.snapshots).toHaveLength(0)
    })
})
