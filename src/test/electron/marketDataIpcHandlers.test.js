const {describe, expect, it} = require('vitest')
const {
    MARKET_DATA_IPC_CHANNELS,
    registerMarketDataHandlers,
} = require('../../../electron/ipc/registerMarketDataHandlers')

function createFakeIpc() {
    const handlers = new Map()
    return {
        handlers,
        handle(channel, handler) {
            handlers.set(channel, handler)
        },
        invoke(channel, payload) {
            const handler = handlers.get(channel)
            if (!handler) throw new Error(`No handler for ${channel}`)
            return handler({}, payload)
        },
    }
}

function matchesWhere(row, where = {}) {
    return Object.entries(where || {}).every(([key, expected]) => {
        if (key === 'OR') return expected.some((clause) => matchesWhere(row, clause))
        if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
            if ('in' in expected) return expected.in.includes(row[key])
            if ('contains' in expected) return String(row[key] || '').includes(expected.contains)
            if ('gte' in expected && new Date(row[key]).getTime() < new Date(expected.gte).getTime()) return false
            if ('lte' in expected && new Date(row[key]).getTime() > new Date(expected.lte).getTime()) return false
            return true
        }
        if (expected instanceof Date) return new Date(row[key]).getTime() === expected.getTime()
        return row[key] === expected
    })
}

function sortRows(rows, orderBy = []) {
    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy]
    return [...rows].sort((left, right) => {
        for (const clause of clauses.filter(Boolean)) {
            const [[key, direction]] = Object.entries(clause)
            const leftValue = left[key] instanceof Date ? left[key].getTime() : left[key]
            const rightValue = right[key] instanceof Date ? right[key].getTime() : right[key]
            if (leftValue === rightValue) continue
            const modifier = direction === 'desc' ? -1 : 1
            return leftValue > rightValue ? modifier : -modifier
        }
        return 0
    })
}

function createFakePrisma() {
    const now = new Date('2026-04-28T12:00:00.000Z')
    const instruments = [
        {
            id: 1,
            instrumentKey: 'local:AAPL:XNAS:USD',
            symbol: 'AAPL',
            name: 'Apple Inc.',
            instrumentType: 'EQUITY',
            exchange: 'XNAS',
            quoteCurrency: 'USD',
            provider: 'local',
            providerInstrumentId: 'AAPL',
            currentPrice: null,
            currentPriceCurrency: null,
            currentPriceQuotedAt: null,
            currentPriceProvider: null,
            freshnessStatus: 'UNKNOWN',
            freshnessCheckedAt: null,
            staleAfterHours: 24,
            isActive: true,
            note: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        },
    ]
    const snapshots = []
    const holdingLots = [
        {
            id: 5,
            name: 'Apple lot',
            quantity: 3,
            currency: 'USD',
            unitPrice: 40,
            marketValue: 120,
            valueAsOf: new Date('2026-04-01T00:00:00.000Z'),
            marketInstrumentId: 1,
            marketInstrument: instruments[0],
        },
    ]

    return {
        state: {instruments, snapshots, holdingLots},
        marketInstrument: {
            findMany: async ({where, include, orderBy} = {}) =>
                sortRows(instruments.filter((row) => matchesWhere(row, where)), orderBy).map((instrument) => ({
                    ...instrument,
                    priceSnapshots: include?.priceSnapshots
                        ? sortRows(
                            snapshots.filter((snapshot) => snapshot.marketInstrumentId === instrument.id),
                            include.priceSnapshots.orderBy,
                        ).slice(0, include.priceSnapshots.take || undefined)
                        : undefined,
                })),
            findUnique: async ({where}) => instruments.find((row) => row.id === where.id) || null,
            findFirst: async ({
                                  where,
                                  orderBy
                              } = {}) => sortRows(instruments.filter((row) => matchesWhere(row, where)), orderBy)[0] || null,
            update: async ({where, data}) => {
                const row = instruments.find((instrument) => instrument.id === where.id)
                if (!row) throw new Error('Instrument not found')
                Object.assign(row, data, {updatedAt: now})
                return row
            },
            upsert: async ({where, create, update, include}) => {
                const row = instruments.find((instrument) => instrument.instrumentKey === where.instrumentKey)
                if (row) {
                    Object.assign(row, update, {updatedAt: now})
                    return {...row, priceSnapshots: include?.priceSnapshots ? [] : undefined}
                }
                const created = {id: instruments.length + 1, ...create, createdAt: now, updatedAt: now}
                instruments.push(created)
                return {...created, priceSnapshots: include?.priceSnapshots ? [] : undefined}
            },
        },
        priceSnapshot: {
            findFirst: async ({
                                  where,
                                  orderBy
                              } = {}) => sortRows(snapshots.filter((row) => matchesWhere(row, where)), orderBy)[0] || null,
            findMany: async ({
                                 where,
                                 orderBy,
                                 take
                             } = {}) => sortRows(snapshots.filter((row) => matchesWhere(row, where)), orderBy).slice(0, take || undefined),
            create: async ({data}) => {
                const row = {id: snapshots.length + 10, createdAt: now, updatedAt: now, ...data}
                snapshots.push(row)
                return row
            },
            update: async ({where, data}) => {
                const row = snapshots.find((snapshot) => snapshot.id === where.id)
                if (!row) throw new Error('Snapshot not found')
                Object.assign(row, data, {updatedAt: now})
                return row
            },
        },
        holdingLot: {
            findUnique: async ({where}) => holdingLots.find((row) => row.id === where.id) || null,
        },
        asset: {
            findUnique: async () => null,
        },
    }
}

describe('market data IPC handlers', () => {
    it('registers every market data and watchlist channel with safe IPC envelopes', async () => {
        const prisma = createFakePrisma()
        const ipc = createFakeIpc()
        registerMarketDataHandlers({ipc, prisma, now: () => new Date('2026-04-28T12:00:00.000Z')})

        expect([...ipc.handlers.keys()].sort()).toEqual(Object.values(MARKET_DATA_IPC_CHANNELS).sort())

        const instruments = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.LIST_INSTRUMENTS, {})
        expect(instruments).toMatchObject({ok: true, error: null})
        expect(instruments.data[0].symbol).toBe('AAPL')

        const missingSnapshot = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.GET_LATEST_SNAPSHOT, {instrumentId: 1})
        expect(missingSnapshot.ok).toBe(false)
        expect(missingSnapshot.error.code).toBe('NO_LOCAL_DATA')
    })

    it('refreshes an instrument through the injected provider and stores a local snapshot', async () => {
        const prisma = createFakePrisma()
        const ipc = createFakeIpc()
        const provider = {
            getQuote: async () => ({
                price: 200.12,
                currency: 'USD',
                pricedAt: '2026-04-28T10:00:00.000Z',
                provider: 'local',
            }),
        }
        registerMarketDataHandlers({ipc, prisma, provider, now: () => new Date('2026-04-28T12:00:00.000Z')})

        const result = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.REFRESH, {instrumentId: 1})

        expect(result.ok).toBe(true)
        expect(result.data.status).toBe('REFRESHED')
        expect(result.data.snapshot.unitPrice).toBe(200.12)
        expect(result.data.instrument.currentPrice).toBe(200.12)
        expect(prisma.state.snapshots).toHaveLength(1)
    })

    it('returns provider failures as recoverable fallback data when a local snapshot exists', async () => {
        const prisma = createFakePrisma()
        prisma.state.snapshots.push({
            id: 42,
            unitPrice: 198,
            currency: 'USD',
            pricedAt: new Date('2026-04-27T10:00:00.000Z'),
            provider: 'local',
            source: 'API',
            freshnessStatus: 'STALE',
            retrievedAt: new Date('2026-04-27T10:01:00.000Z'),
            marketInstrumentId: 1,
            holdingLotId: null,
            createdAt: new Date('2026-04-27T10:01:00.000Z'),
            updatedAt: new Date('2026-04-27T10:01:00.000Z'),
        })
        const ipc = createFakeIpc()
        const provider = {
            getQuote: async () => {
                throw Object.assign(new Error('Provider down'), {code: 'PROVIDER_UNAVAILABLE'})
            },
        }
        registerMarketDataHandlers({ipc, prisma, provider, now: () => new Date('2026-04-28T12:00:00.000Z')})

        const result = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.REFRESH, {instrumentId: 1})

        expect(result.ok).toBe(true)
        expect(result.data.status).toBe('FAILED_WITH_FALLBACK')
        expect(result.data.error.code).toBe('PROVIDER_UNAVAILABLE')
        expect(result.data.fallbackSnapshot.unitPrice).toBe(198)
    })

    it('valuates a holding lot from local snapshot before manual fallback', async () => {
        const prisma = createFakePrisma()
        prisma.state.snapshots.push({
            id: 42,
            unitPrice: 50,
            currency: 'USD',
            pricedAt: new Date('2026-04-28T10:00:00.000Z'),
            provider: 'local',
            source: 'API',
            freshnessStatus: 'FRESH',
            retrievedAt: new Date('2026-04-28T10:01:00.000Z'),
            marketInstrumentId: 1,
            holdingLotId: null,
            createdAt: new Date('2026-04-28T10:01:00.000Z'),
            updatedAt: new Date('2026-04-28T10:01:00.000Z'),
        })
        const ipc = createFakeIpc()
        registerMarketDataHandlers({ipc, prisma, now: () => new Date('2026-04-28T12:00:00.000Z')})

        const result = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.GET_VALUATION, {holdingLotId: 5})

        expect(result.ok).toBe(true)
        expect(result.data.valuationSource).toBe('LOCAL_SNAPSHOT')
        expect(result.data.marketValue).toBe(150)
    })
})
