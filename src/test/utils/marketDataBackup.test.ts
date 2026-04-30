import {describe, expect, it} from 'vitest'
import {
    createMarketDataBackupSection,
    parseMarketDataBackupSection,
} from '../../utils/marketDataBackup'

const instruments = [
    {
        id: 1,
        instrumentKey: 'local:AAPL:XNAS:USD',
        symbol: 'aapl',
        name: 'Apple Inc.',
        instrumentType: 'EQUITY',
        exchange: 'xnas',
        quoteCurrency: 'usd',
        provider: 'local',
        providerInstrumentId: 'AAPL',
        currentPrice: 198.12,
        currentPriceCurrency: 'usd',
        currentPriceQuotedAt: '2026-04-28T10:00:00.000Z',
        currentPriceProvider: 'local',
        freshnessStatus: 'FRESH',
        freshnessCheckedAt: '2026-04-28T10:01:00.000Z',
        staleAfterHours: 24,
        isActive: true,
        note: 'active watchlist fixture',
    },
    {
        id: 2,
        instrumentKey: 'local:BTC:CRYPTO:CAD',
        symbol: 'BTC',
        name: 'Bitcoin',
        instrumentType: 'CRYPTO',
        exchange: 'CRYPTO',
        quoteCurrency: 'CAD',
        provider: 'local',
        providerInstrumentId: 'BTC-CAD',
        currentPrice: null,
        currentPriceCurrency: null,
        currentPriceQuotedAt: null,
        currentPriceProvider: null,
        freshnessStatus: 'UNAVAILABLE',
        freshnessCheckedAt: null,
        staleAfterHours: 12,
        isActive: false,
        note: 'inactive instrument must still be preserved by backup',
    },
]

const snapshots = [
    {
        id: 10,
        marketInstrumentId: 1,
        holdingLotId: null,
        unitPrice: 198.12,
        currency: 'usd',
        pricedAt: '2026-04-28T10:00:00.000Z',
        provider: 'local',
        source: 'API',
        freshnessStatus: 'FRESH',
        retrievedAt: '2026-04-28T10:01:00.000Z',
        note: 'latest AAPL snapshot',
    },
]

describe('market data backup helpers', () => {
    it('round-trips active watchlist instruments, inactive instruments and local snapshots', () => {
        const section = createMarketDataBackupSection(instruments, snapshots)
        const serialized = JSON.stringify(section)
        const parsed = parseMarketDataBackupSection(JSON.parse(serialized))

        expect(parsed.marketInstruments).toHaveLength(2)
        expect(parsed.marketInstruments[0]).toMatchObject({
            symbol: 'AAPL',
            exchange: 'XNAS',
            quoteCurrency: 'USD',
            isActive: true,
        })
        expect(parsed.marketInstruments[1]).toMatchObject({
            symbol: 'BTC',
            isActive: false,
            freshnessStatus: 'UNAVAILABLE',
        })
        expect(parsed.priceSnapshots[0]).toMatchObject({
            marketInstrumentId: 1,
            unitPrice: 198.12,
            currency: 'USD',
            source: 'API',
        })
    })

    it('rejects a snapshot that points to a missing market instrument', () => {
        expect(() =>
            parseMarketDataBackupSection({
                marketInstruments: instruments.slice(0, 1),
                priceSnapshots: [{...snapshots[0], id: 99, marketInstrumentId: 404}],
            }),
        ).toThrow(/instrument absent/)
    })

    it('rejects invalid prices before restore writes corrupt cache rows', () => {
        expect(() =>
            parseMarketDataBackupSection({
                marketInstruments: instruments,
                priceSnapshots: [{...snapshots[0], unitPrice: 0}],
            }),
        ).toThrow(/unitPrice/)
    })
})
