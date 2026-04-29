const {describe, expect, it} = require('vitest')
const {
    calculateFreshnessStatus,
    getAssetValuation,
    getLatestSnapshot,
    normalizeQuote,
    refreshMarketData,
} = require('../../../electron/ipc/marketDataHandlers')
const {
    MARKET_DATA_IPC_CHANNELS,
    registerMarketDataHandlers,
} = require('../../../electron/ipc/registerMarketDataHandlers')
const {
    createPriceSnapshotRepository,
    calculateSnapshotFreshness,
} = require('../../../electron/marketData/priceSnapshotRepository')
const {calculateMarketValuation} = require('../../../electron/marketData/valuationService')
const {refreshWatchlist} = require('../../../electron/ipc/marketDataWatchlistHandlers')
const {
    DEMO_MARKET_NOW,
    demoAssets,
    demoHoldingLots,
    demoMarketInstruments,
    demoPriceSnapshots,
} = require('../fixtures/marketDataDemo')

function cloneDate(value) {
    return value instanceof Date ? new Date(value.getTime()) : value
}

function cloneRow(row) {
    const copy = {...row}
    for (const [key, value] of Object.entries(copy)) {
        if (value instanceof Date) copy[key] = cloneDate(value)
    }
    return copy
}

function normalizeComparable(value) {
    if (value instanceof Date) return value.getTime()
    return value
}

function valueMatches(rowValue, expected) {
    if (expected instanceof Date) return normalizeComparable(rowValue) === expected.getTime()
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('in' in expected) return expected.in.includes(rowValue)
        if ('lte' in expected && new Date(rowValue).getTime() > new Date(expected.lte).getTime()) return false
        if ('gte' in expected && new Date(rowValue).getTime() < new Date(expected.gte).getTime()) return false
        if ('contains' in expected) return String(rowValue || '').includes(expected.contains)
        return true
    }
    return rowValue === expected
}

function matchesWhere(row, where = {}) {
    if (!where) return true
    return Object.entries(where).every(([key, expected]) => {
        if (key === 'OR') return expected.some((clause) => matchesWhere(row, clause))
        return valueMatches(row[key], expected)
    })
}

function sortByOrder(rows, orderBy) {
    const clauses = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
    if (!clauses.length) return rows
    return [...rows].sort((left, right) => {
        for (const clause of clauses) {
            const [[key, direction]] = Object.entries(clause)
            const leftValue = normalizeComparable(left[key])
            const rightValue = normalizeComparable(right[key])
            if (leftValue === rightValue) continue
            const modifier = direction === 'desc' ? -1 : 1
            return leftValue > rightValue ? modifier : -modifier
        }
        return 0
    })
}

function withRelations(row, state, include = {}) {
    if (!row) return row
    const copy = {...row}
    if (include.marketInstrument) {
        copy.marketInstrument = state.instruments.find((instrument) => instrument.id === row.marketInstrumentId) || null
    }
    if (include.holdingLot) {
        copy.holdingLot = state.holdingLots.find((lot) => lot.id === row.holdingLotId) || null
    }
    if (include.priceSnapshots) {
        copy.priceSnapshots = sortByOrder(
            state.snapshots.filter((snapshot) => snapshot.marketInstrumentId === row.id),
            include.priceSnapshots.orderBy,
        ).slice(0, include.priceSnapshots.take || undefined)
    }
    return copy
}

function createMarketDataPrisma(seed = {}) {
    const state = {
        instruments: (seed.instruments || demoMarketInstruments).map(cloneRow),
        snapshots: (seed.snapshots || demoPriceSnapshots).map(cloneRow),
        holdingLots: (seed.holdingLots || demoHoldingLots).map(cloneRow),
        assets: (seed.assets || demoAssets).map(cloneRow),
        nextInstrumentId: seed.nextInstrumentId || 100,
        nextSnapshotId: seed.nextSnapshotId || 1000,
    }

    return {
        state,
        marketInstrument: {
            findMany: async ({where, include, orderBy, take} = {}) => {
                const rows = sortByOrder(state.instruments.filter((row) => matchesWhere(row, where)), orderBy)
                return rows.slice(0, take || undefined).map((row) => withRelations(row, state, include))
            },
            findUnique: async ({where, include} = {}) =>
                withRelations(state.instruments.find((row) => row.id === where.id) || null, state, include),
            findFirst: async ({where, include, orderBy} = {}) =>
                withRelations(sortByOrder(state.instruments.filter((row) => matchesWhere(row, where)), orderBy)[0] || null, state, include),
            update: async ({where, data, include}) => {
                const index = state.instruments.findIndex((row) => row.id === where.id)
                if (index < 0) throw new Error(`Instrument ${where.id} not found`)
                state.instruments[index] = {...state.instruments[index], ...data, updatedAt: DEMO_MARKET_NOW}
                return withRelations(state.instruments[index], state, include)
            },
            upsert: async ({where, create, update, include}) => {
                const index = state.instruments.findIndex((row) => row.instrumentKey === where.instrumentKey)
                if (index >= 0) {
                    state.instruments[index] = {...state.instruments[index], ...update, updatedAt: DEMO_MARKET_NOW}
                    return withRelations(state.instruments[index], state, include)
                }
                const row = {
                    id: state.nextInstrumentId++,
                    currentPrice: null,
                    currentPriceCurrency: null,
                    currentPriceQuotedAt: null,
                    currentPriceProvider: null,
                    freshnessStatus: 'UNKNOWN',
                    freshnessCheckedAt: null,
                    createdAt: DEMO_MARKET_NOW,
                    updatedAt: DEMO_MARKET_NOW,
                    ...create,
                }
                state.instruments.push(row)
                return withRelations(row, state, include)
            },
        },
        priceSnapshot: {
            findFirst: async ({where, include, orderBy} = {}) =>
                withRelations(sortByOrder(state.snapshots.filter((row) => matchesWhere(row, where)), orderBy)[0] || null, state, include),
            findMany: async ({where, include, orderBy, take} = {}) =>
                sortByOrder(state.snapshots.filter((row) => matchesWhere(row, where)), orderBy)
                    .slice(0, take || undefined)
                    .map((row) => withRelations(row, state, include)),
            create: async ({data, include}) => {
                const row = {
                    id: state.nextSnapshotId++,
                    createdAt: DEMO_MARKET_NOW,
                    updatedAt: DEMO_MARKET_NOW,
                    ...data,
                }
                state.snapshots.push(row)
                return withRelations(row, state, include)
            },
            update: async ({where, data, include}) => {
                const index = state.snapshots.findIndex((row) => row.id === where.id)
                if (index < 0) throw new Error(`Snapshot ${where.id} not found`)
                state.snapshots[index] = {...state.snapshots[index], ...data, updatedAt: DEMO_MARKET_NOW}
                return withRelations(state.snapshots[index], state, include)
            },
        },
        holdingLot: {
            findUnique: async ({where, include} = {}) =>
                withRelations(state.holdingLots.find((row) => row.id === where.id) || null, state, include),
        },
        asset: {
            findUnique: async ({where, include} = {}) =>
                withRelations(state.assets.find((row) => row.id === where.id) || null, state, include),
        },
    }
}

function createFakeIpc() {
    const handlers = new Map()
    return {
        handlers,
        handle(channel, handler) {
            handlers.set(channel, handler)
        },
        invoke(channel, payload) {
            const handler = handlers.get(channel)
            if (!handler) throw new Error(`No IPC handler for ${channel}`)
            return handler({}, payload)
        },
    }
}

describe('market data MVP tests and fixtures', () => {
    it('normalizes provider quotes and rejects invalid provider prices', () => {
        const instrument = demoMarketInstruments[0]
        const quote = normalizeQuote(
            {
                regularMarketPrice: '201.42',
                currency: 'usd',
                timestamp: '2026-04-28T11:30:00.000Z',
                provider: 'fixture-provider',
            },
            instrument,
        )

        expect(quote).toMatchObject({
            unitPrice: 201.42,
            currency: 'USD',
            provider: 'fixture-provider',
            source: 'API',
            freshnessStatus: 'FRESH',
        })
        expect(quote.pricedAt.toISOString()).toBe('2026-04-28T11:30:00.000Z')
        expect(() => normalizeQuote({price: 0, currency: 'USD'}, instrument)).toThrow(/prix invalide/)
    })

    it('stores local snapshots, updates the instrument cache and reads the latest usable price', async () => {
        const prisma = createMarketDataPrisma({snapshots: []})
        const repository = createPriceSnapshotRepository(prisma, {now: DEMO_MARKET_NOW})

        await repository.createSnapshot({
            instrumentId: 1,
            unitPrice: 197,
            currency: 'USD',
            pricedAt: '2026-04-27T16:00:00.000Z',
            providerId: 'local',
            source: 'PROVIDER',
            freshnessStatus: 'STALE',
        })
        const latest = await repository.createSnapshot({
            instrumentId: 1,
            unitPrice: 199.5,
            currency: 'USD',
            pricedAt: '2026-04-28T11:00:00.000Z',
            providerId: 'local',
            source: 'PROVIDER',
            freshnessStatus: 'FRESH',
        })

        expect(latest).toMatchObject({
            instrumentId: 1,
            unitPrice: 199.5,
            currency: 'USD',
            source: 'PROVIDER',
            freshnessStatus: 'FRESH',
        })
        expect(prisma.state.instruments.find((instrument) => instrument.id === 1)).toMatchObject({
            currentPrice: 199.5,
            currentPriceCurrency: 'USD',
            currentPriceProvider: 'local',
            freshnessStatus: 'FRESH',
        })

        const reloaded = await repository.getLatestUsableSnapshot(1, {now: DEMO_MARKET_NOW})
        expect(reloaded.unitPrice).toBe(199.5)
    })

    it('calculates freshness status without network calls', () => {
        expect(
            calculateFreshnessStatus(
                {pricedAt: new Date('2026-04-28T10:00:00.000Z'), freshnessStatus: 'UNKNOWN', staleAfterHours: 24},
                DEMO_MARKET_NOW,
            ),
        ).toBe('FRESH')

        expect(
            calculateFreshnessStatus(
                {pricedAt: new Date('2026-04-24T10:00:00.000Z'), freshnessStatus: 'UNKNOWN', staleAfterHours: 24},
                DEMO_MARKET_NOW,
            ),
        ).toBe('STALE')

        expect(
            calculateSnapshotFreshness(
                {unitPrice: 33.8, pricedAt: new Date('2026-04-24T16:00:00.000Z'), freshnessStatus: 'FRESH'},
                {now: DEMO_MARKET_NOW, staleAfterHours: 24},
            ),
        ).toBe('STALE')
    })

    it('reads the latest local snapshot before manual fallback in IPC valuation', async () => {
        const prisma = createMarketDataPrisma()
        const latest = await getLatestSnapshot(prisma, {instrumentId: 1}, {now: DEMO_MARKET_NOW})
        const valuation = await getAssetValuation(prisma, {holdingLotId: 101}, {now: DEMO_MARKET_NOW})

        expect(latest.unitPrice).toBe(198.12)
        expect(valuation).toMatchObject({
            entityType: 'holdingLot',
            entityId: 101,
            valuationSource: 'LOCAL_SNAPSHOT',
            unitPrice: 198.12,
            marketValue: 1981.2,
            currency: 'USD',
        })
    })

    it('falls back to manual valuation when no local market snapshot exists', async () => {
        const prisma = createMarketDataPrisma()
        const valuation = await getAssetValuation(prisma, {holdingLotId: 102}, {now: DEMO_MARKET_NOW})

        expect(valuation).toMatchObject({
            entityType: 'holdingLot',
            entityId: 102,
            valuationSource: 'MANUAL_FALLBACK',
            marketValue: 1100,
            currency: 'CAD',
        })
    })

    it('uses FX conversion when the quote currency differs from the display currency', async () => {
        const result = await calculateMarketValuation({
            entityType: 'holdingLot',
            entityId: 101,
            instrumentId: 1,
            quantity: 10,
            currency: 'CAD',
            displayCurrency: 'CAD',
            quoteCurrency: 'USD',
            snapshot: {
                id: 11,
                instrumentId: 1,
                unitPrice: 198.12,
                currency: 'USD',
                pricedAt: '2026-04-28T10:00:00.000Z',
                provider: 'local',
                source: 'PROVIDER',
                freshnessStatus: 'FRESH',
                stalenessStatus: 'FRESH',
            },
            fxRates: {
                'USD:CAD': {rate: 1.36, provider: 'fixture-fx', date: '2026-04-28'},
            },
        })

        expect(result).toMatchObject({
            source: 'SNAPSHOT',
            mode: 'LATEST_PRICE',
            quoteCurrency: 'USD',
            displayCurrency: 'CAD',
            nativeMarketValue: 1981.2,
            marketValue: 2694.43,
        })
        expect(result.fxRate).toMatchObject({from: 'USD', to: 'CAD', rate: 1.36, provider: 'fixture-fx'})
    })

    it('keeps the last local snapshot when the provider fails', async () => {
        const prisma = createMarketDataPrisma()
        const provider = {
            getQuote: async () => {
                throw Object.assign(new Error('rate limit fixture'), {code: 'RATE_LIMITED'})
            },
        }

        const result = await refreshMarketData(prisma, provider, {instrumentId: 1}, {now: DEMO_MARKET_NOW})

        expect(result).toMatchObject({
            status: 'FAILED_WITH_FALLBACK',
            error: {code: 'RATE_LIMITED'},
            fallbackSnapshot: {unitPrice: 198.12, freshnessStatus: 'FRESH'},
        })
    })

    it('covers main IPC channels including watchlist refresh without a real network provider', async () => {
        const prisma = createMarketDataPrisma()
        const ipc = createFakeIpc()
        registerMarketDataHandlers({ipc, prisma, now: () => DEMO_MARKET_NOW})

        expect(ipc.handlers.has(MARKET_DATA_IPC_CHANNELS.LIST_INSTRUMENTS)).toBe(true)
        expect(ipc.handlers.has(MARKET_DATA_IPC_CHANNELS.WATCHLIST_REFRESH)).toBe(true)

        const instruments = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.LIST_INSTRUMENTS, {})
        expect(instruments.ok).toBe(true)
        expect(instruments.data.map((instrument) => instrument.symbol)).toContain('AAPL')

        const refresh = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.WATCHLIST_REFRESH, {instrumentIds: [1]})
        expect(refresh.ok).toBe(true)
        expect(refresh.data.status).toBe('SUCCESS')
        expect(refresh.data.summary).toMatchObject({requested: 1, succeeded: 1, failed: 0})
    })

    it('demo watchlist fixture exercises the provider-offline fallback path', async () => {
        const prisma = createMarketDataPrisma()
        const result = await refreshWatchlist(prisma, {instrumentIds: [3]}, {now: DEMO_MARKET_NOW})

        expect(result.status).toBe('FAILED')
        expect(result.errors[0]).toMatchObject({
            status: 'PROVIDER_UNAVAILABLE',
            symbol: 'MSFT',
            recoverable: true,
        })
        expect(prisma.state.snapshots.filter((snapshot) => snapshot.marketInstrumentId === 3)).toHaveLength(1)
    })
})
