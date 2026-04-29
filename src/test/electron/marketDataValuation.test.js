const {describe, expect, it} = require('vitest')
const {
    calculateSnapshotFreshness,
    createMarketValuationService,
    createPriceSnapshotRepository,
    createStaticFxRateResolver,
} = require('../../../electron/marketData')

function createFakePrisma({snapshots = [], instruments = []} = {}) {
    const state = {
        snapshots: snapshots.map((snapshot, index) => ({id: index + 1, ...snapshot})),
        instruments: instruments.map((instrument, index) => ({id: index + 1, ...instrument})),
        nextSnapshotId: snapshots.length + 1,
    }

    function withRelations(snapshot) {
        if (!snapshot) return null
        return {
            ...snapshot,
            marketInstrument:
                state.instruments.find((instrument) => instrument.id === snapshot.marketInstrumentId) || null,
            holdingLot: snapshot.holdingLot || null,
        }
    }

    function matchesWhere(row, where = {}) {
        if (where.marketInstrumentId != null && row.marketInstrumentId !== where.marketInstrumentId) return false
        if (where.holdingLotId != null && row.holdingLotId !== where.holdingLotId) return false
        if (where.currency != null && row.currency !== where.currency) return false
        if (where.freshnessStatus?.in && !where.freshnessStatus.in.includes(row.freshnessStatus)) return false
        if (where.pricedAt?.lte && new Date(row.pricedAt).getTime() > new Date(where.pricedAt.lte).getTime()) {
            return false
        }
        return true
    }

    return {
        state,
        priceSnapshot: {
            async create({data}) {
                const row = {
                    id: state.nextSnapshotId++,
                    createdAt: new Date('2026-04-28T10:00:00.000Z'),
                    updatedAt: new Date('2026-04-28T10:00:00.000Z'),
                    ...data,
                }
                state.snapshots.push(row)
                return withRelations(row)
            },
            async findMany({where, orderBy, take} = {}) {
                let rows = state.snapshots.filter((row) => matchesWhere(row, where)).map(withRelations)
                if (orderBy?.pricedAt === 'desc') {
                    rows = rows.sort((a, b) => new Date(b.pricedAt).getTime() - new Date(a.pricedAt).getTime())
                }
                return take ? rows.slice(0, take) : rows
            },
        },
        marketInstrument: {
            async update({where, data}) {
                const instrument = state.instruments.find((row) => row.id === where.id)
                if (!instrument) throw new Error('Instrument not found')
                Object.assign(instrument, data)
                return instrument
            },
        },
    }
}

describe('price snapshot repository', () => {
    it('writes a normalized snapshot and updates the instrument price cache', async () => {
        const prisma = createFakePrisma({
            instruments: [{id: 10, symbol: 'AAPL', quoteCurrency: 'USD', staleAfterHours: 24}],
        })
        const repository = createPriceSnapshotRepository(prisma, {
            now: new Date('2026-04-28T12:00:00.000Z'),
        })

        const snapshot = await repository.createSnapshot({
            instrumentId: 10,
            providerId: 'mock-local',
            unitPrice: '180.25',
            currency: 'usd',
            pricedAt: '2026-04-28T11:00:00.000Z',
            source: 'PROVIDER',
            stalenessStatus: 'FRESH',
        })

        expect(snapshot.instrumentId).toBe(10)
        expect(snapshot.currency).toBe('USD')
        expect(snapshot.source).toBe('PROVIDER')
        expect(snapshot.stalenessStatus).toBe('FRESH')
        expect(prisma.state.instruments[0].currentPrice).toBe(180.25)
        expect(prisma.state.instruments[0].currentPriceCurrency).toBe('USD')
    })

    it('returns the latest stale-but-usable snapshot for an instrument', async () => {
        const prisma = createFakePrisma({
            instruments: [{id: 10, symbol: 'AAPL', quoteCurrency: 'USD', staleAfterHours: 1}],
            snapshots: [
                {
                    id: 1,
                    marketInstrumentId: 10,
                    unitPrice: 170,
                    currency: 'USD',
                    pricedAt: new Date('2026-04-27T08:00:00.000Z'),
                    retrievedAt: new Date('2026-04-27T08:01:00.000Z'),
                    source: 'API',
                    provider: 'mock-local',
                    freshnessStatus: 'FRESH',
                    createdAt: new Date('2026-04-27T08:01:00.000Z'),
                    updatedAt: new Date('2026-04-27T08:01:00.000Z'),
                },
            ],
        })
        const repository = createPriceSnapshotRepository(prisma)

        const snapshot = await repository.getLatestUsableSnapshot(10, {
            now: new Date('2026-04-28T12:00:00.000Z'),
        })

        expect(snapshot.unitPrice).toBe(170)
        expect(snapshot.stalenessStatus).toBe('STALE')
        expect(calculateSnapshotFreshness(snapshot, {now: new Date('2026-04-28T12:00:00.000Z')})).toBe('STALE')
    })
})

describe('market valuation service', () => {
    it('values a position from the latest local snapshot and converts to display currency', async () => {
        const snapshotRepository = {
            async getLatestUsableSnapshot() {
                return {
                    id: 1,
                    instrumentId: 10,
                    symbol: 'AAPL',
                    unitPrice: 100,
                    currency: 'USD',
                    pricedAt: '2026-04-28T10:00:00.000Z',
                    stalenessStatus: 'FRESH',
                    source: 'PROVIDER',
                }
            },
        }
        const service = createMarketValuationService({
            snapshotRepository,
            fxRates: {'USD:CAD': 1.35},
        })

        const result = await service.valuePosition({
            entityType: 'holdingLot',
            entityId: 5,
            instrumentId: 10,
            quantity: 3,
            currency: 'CAD',
            displayCurrency: 'CAD',
            quoteCurrency: 'USD',
        })

        expect(result.source).toBe('SNAPSHOT')
        expect(result.unitPrice).toBe(100)
        expect(result.nativeMarketValue).toBe(300)
        expect(result.marketValue).toBe(405)
        expect(result.fxRate.rate).toBe(1.35)
        expect(result.error).toBeNull()
    })

    it('keeps stale snapshot data usable and marks it clearly', async () => {
        const service = createMarketValuationService({
            snapshotRepository: {
                async getLatestUsableSnapshot() {
                    return {
                        id: 1,
                        instrumentId: 10,
                        unitPrice: 50,
                        currency: 'CAD',
                        pricedAt: '2026-04-01T00:00:00.000Z',
                        stalenessStatus: 'STALE',
                    }
                },
            },
        })

        const result = await service.valuePosition({
            entityType: 'holdingLot',
            instrumentId: 10,
            quantity: 2,
            currency: 'CAD',
        })

        expect(result.source).toBe('SNAPSHOT')
        expect(result.marketValue).toBe(100)
        expect(result.stalenessStatus).toBe('STALE')
    })

    it('falls back to the manual value when no snapshot exists', async () => {
        const service = createMarketValuationService({
            snapshotRepository: {
                async getLatestUsableSnapshot() {
                    return null
                },
            },
        })

        const result = await service.valueHoldingLot({
            id: 7,
            marketInstrumentId: 10,
            quantity: 4,
            currency: 'CAD',
            unitPrice: 20,
            marketValue: null,
            valueAsOf: '2026-04-20T00:00:00.000Z',
        })

        expect(result.source).toBe('MANUAL')
        expect(result.mode).toBe('FALLBACK_MANUAL')
        expect(result.marketValue).toBe(80)
        expect(result.error).toBeNull()
        expect(result.warnings).toContain('Valorisation basée sur la valeur manuelle de fallback.')
    })

    it('returns unavailable instead of throwing when neither snapshot nor manual value exists', async () => {
        const service = createMarketValuationService({
            snapshotRepository: {
                async getLatestUsableSnapshot() {
                    return null
                },
            },
        })

        const result = await service.valuePosition({
            entityType: 'holdingLot',
            entityId: 8,
            instrumentId: 10,
            quantity: 1,
            currency: 'CAD',
        })

        expect(result.source).toBe('UNAVAILABLE')
        expect(result.marketValue).toBeNull()
        expect(result.error.code).toBe('SNAPSHOT_UNAVAILABLE')
    })

    it('preserves native value and reports a clean FX error when conversion is missing', async () => {
        const service = createMarketValuationService({
            snapshotRepository: {
                async getLatestUsableSnapshot() {
                    return {
                        id: 1,
                        instrumentId: 10,
                        unitPrice: 100,
                        currency: 'USD',
                        pricedAt: '2026-04-28T10:00:00.000Z',
                        stalenessStatus: 'FRESH',
                    }
                },
            },
        })

        const result = await service.valuePosition({
            entityType: 'holdingLot',
            instrumentId: 10,
            quantity: 2,
            displayCurrency: 'CAD',
            quoteCurrency: 'USD',
        })

        expect(result.source).toBe('SNAPSHOT')
        expect(result.nativeMarketValue).toBe(200)
        expect(result.marketValue).toBeNull()
        expect(result.error.code).toBe('FX_RATE_UNAVAILABLE')
        expect(result.warnings[0]).toMatch(/valeur native/i)
    })

    it('can use an injected FX resolver compatible with the existing FX handler shape', async () => {
        const resolver = createStaticFxRateResolver({'EUR:CAD': {rate: 1.47, provider: 'TEST'}})
        const result = await createMarketValuationService({
            fxRateResolver: resolver,
        }).valuePosition({
            entityType: 'asset',
            entityId: 3,
            instrumentId: null,
            quantity: 1,
            manualMarketValue: 1000,
            manualCurrency: 'EUR',
            displayCurrency: 'CAD',
        })

        expect(result.source).toBe('MANUAL')
        expect(result.marketValue).toBe(1470)
        expect(result.fxRate.provider).toBe('TEST')
    })
})
