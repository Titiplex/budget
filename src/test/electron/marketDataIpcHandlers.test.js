const {describe, expect, it} = require('vitest')

const {
  MARKET_DATA_IPC_CHANNELS,
  registerMarketDataHandlers,
} = require('../../../electron/ipc/registerMarketDataHandlers')

function sortSnapshots(rows) {
  return [...rows].sort((left, right) => {
    const priced = new Date(right.pricedAt).getTime() - new Date(left.pricedAt).getTime()
    if (priced !== 0) return priced
    return right.id - left.id
  })
}

function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      if (expected.in) return expected.in.includes(row[key])
      if (expected.gte && new Date(row[key]).getTime() < new Date(expected.gte).getTime()) return false
      if (expected.lte && new Date(row[key]).getTime() > new Date(expected.lte).getTime()) return false
      if (expected.contains) return String(row[key] || '').includes(expected.contains)
      return true
    }

    return row[key] === expected
  })
}

function createFakePrisma(seed = {}) {
  const state = {
    instruments: [...(seed.instruments || [])],
    snapshots: [...(seed.snapshots || [])],
    holdingLots: [...(seed.holdingLots || [])],
    assets: [...(seed.assets || [])],
    nextSnapshotId: seed.nextSnapshotId || 100,
  }

  return {
    state,
    marketInstrument: {
      findMany: async ({where} = {}) => state.instruments.filter((row) => matchesWhere(row, where)),
      findUnique: async ({where}) => state.instruments.find((row) => row.id === where.id) || null,
      findFirst: async ({where} = {}) => state.instruments.find((row) => matchesWhere(row, where)) || null,
      update: async ({where, data}) => {
        const index = state.instruments.findIndex((row) => row.id === where.id)
        if (index < 0) throw new Error('Instrument not found')
        state.instruments[index] = {...state.instruments[index], ...data, updatedAt: new Date('2026-04-28T12:00:00Z')}
        return state.instruments[index]
      },
    },
    priceSnapshot: {
      findFirst: async ({where} = {}) => sortSnapshots(state.snapshots.filter((row) => matchesWhere(row, where)))[0] || null,
      findMany: async ({where, take} = {}) => sortSnapshots(state.snapshots.filter((row) => matchesWhere(row, where))).slice(0, take || 30),
      create: async ({data}) => {
        const row = {
          id: state.nextSnapshotId++,
          createdAt: new Date('2026-04-28T12:00:00Z'),
          updatedAt: new Date('2026-04-28T12:00:00Z'),
          ...data,
        }
        state.snapshots.push(row)
        return row
      },
      update: async ({where, data}) => {
        const index = state.snapshots.findIndex((row) => row.id === where.id)
        if (index < 0) throw new Error('Snapshot not found')
        state.snapshots[index] = {...state.snapshots[index], ...data, updatedAt: new Date('2026-04-28T12:00:00Z')}
        return state.snapshots[index]
      },
    },
    holdingLot: {
      findUnique: async ({where}) => state.holdingLots.find((row) => row.id === where.id) || null,
    },
    asset: {
      findUnique: async ({where}) => state.assets.find((row) => row.id === where.id) || null,
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
      if (!handler) throw new Error(`No handler for ${channel}`)
      return handler({}, payload)
    },
  }
}

const instrument = {
  id: 1,
  instrumentKey: 'mock:AAPL:XNAS:USD',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  instrumentType: 'EQUITY',
  exchange: 'XNAS',
  quoteCurrency: 'USD',
  provider: 'mock',
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
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
}

describe('market data IPC handlers', () => {
  it('registers narrow market data channels without throwing existing IPC errors to the renderer', async () => {
    const prisma = createFakePrisma({instruments: [instrument]})
    const ipc = createFakeIpc()

    registerMarketDataHandlers({ipc, prisma, now: () => new Date('2026-04-28T12:00:00Z')})

    expect([...ipc.handlers.keys()]).toEqual([
      MARKET_DATA_IPC_CHANNELS.LIST_INSTRUMENTS,
      MARKET_DATA_IPC_CHANNELS.GET_LATEST_SNAPSHOT,
      MARKET_DATA_IPC_CHANNELS.LIST_SNAPSHOT_HISTORY,
      MARKET_DATA_IPC_CHANNELS.REFRESH,
      MARKET_DATA_IPC_CHANNELS.GET_VALUATION,
      MARKET_DATA_IPC_CHANNELS.LIST_FRESHNESS_STATUSES,
    ])

    const instruments = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.LIST_INSTRUMENTS, {})
    expect(instruments.ok).toBe(true)
    expect(instruments.data).toHaveLength(1)
    expect(instruments.data[0].symbol).toBe('AAPL')

    const missingSnapshot = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.GET_LATEST_SNAPSHOT, {instrumentId: 1})
    expect(missingSnapshot.ok).toBe(false)
    expect(missingSnapshot.error.code).toBe('NO_LOCAL_DATA')
  })

  it('refreshes an instrument through the provider without exposing provider details to the renderer', async () => {
    const prisma = createFakePrisma({instruments: [instrument]})
    const ipc = createFakeIpc()
    const provider = {
      getQuote: async () => ({
        price: 200.12,
        currency: 'USD',
        pricedAt: '2026-04-28T10:00:00Z',
        provider: 'mock',
      }),
    }

    registerMarketDataHandlers({ipc, prisma, provider, now: () => new Date('2026-04-28T12:00:00Z')})

    const result = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.REFRESH, {instrumentId: 1})

    expect(result.ok).toBe(true)
    expect(result.data.status).toBe('REFRESHED')
    expect(result.data.snapshot.unitPrice).toBe(200.12)
    expect(result.data.instrument.currentPrice).toBe(200.12)
    expect(prisma.state.snapshots).toHaveLength(1)
  })

  it('returns a provider error with the last local snapshot as fallback', async () => {
    const prisma = createFakePrisma({
      instruments: [instrument],
      snapshots: [{
        id: 10,
        unitPrice: 198,
        currency: 'USD',
        pricedAt: new Date('2026-04-27T10:00:00Z'),
        provider: 'mock',
        source: 'API',
        freshnessStatus: 'STALE',
        retrievedAt: new Date('2026-04-27T10:01:00Z'),
        marketInstrumentId: 1,
        holdingLotId: null,
        createdAt: new Date('2026-04-27T10:01:00Z'),
        updatedAt: new Date('2026-04-27T10:01:00Z'),
      }],
    })
    const ipc = createFakeIpc()
    const provider = {getQuote: async () => { throw new Error('Provider down') }}

    registerMarketDataHandlers({ipc, prisma, provider, now: () => new Date('2026-04-28T12:00:00Z')})

    const result = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.REFRESH, {instrumentId: 1})

    expect(result.ok).toBe(true)
    expect(result.data.status).toBe('FAILED_WITH_FALLBACK')
    expect(result.data.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(result.data.fallbackSnapshot.unitPrice).toBe(198)
  })

  it('valuates a holding lot from the latest local snapshot before manual fallback', async () => {
    const prisma = createFakePrisma({
      instruments: [instrument],
      snapshots: [{
        id: 10,
        unitPrice: 50,
        currency: 'USD',
        pricedAt: new Date('2026-04-28T10:00:00Z'),
        provider: 'mock',
        source: 'API',
        freshnessStatus: 'FRESH',
        retrievedAt: new Date('2026-04-28T10:01:00Z'),
        marketInstrumentId: 1,
        holdingLotId: null,
        createdAt: new Date('2026-04-28T10:01:00Z'),
        updatedAt: new Date('2026-04-28T10:01:00Z'),
      }],
      holdingLots: [{
        id: 5,
        name: 'Apple lot',
        quantity: 3,
        currency: 'USD',
        unitPrice: 40,
        marketValue: 120,
        valueAsOf: new Date('2026-04-01T00:00:00Z'),
        marketInstrumentId: 1,
        marketInstrument: instrument,
      }],
    })
    const ipc = createFakeIpc()

    registerMarketDataHandlers({ipc, prisma, now: () => new Date('2026-04-28T12:00:00Z')})

    const result = await ipc.invoke(MARKET_DATA_IPC_CHANNELS.GET_VALUATION, {holdingLotId: 5})

    expect(result.ok).toBe(true)
    expect(result.data.valuationSource).toBe('LOCAL_SNAPSHOT')
    expect(result.data.marketValue).toBe(150)
  })
})
