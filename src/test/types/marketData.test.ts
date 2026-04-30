import {describe, expect, it} from 'vitest'
import {
    MARKET_DATA_PROVIDER_ERROR_STATUSES,
    MARKET_DATA_STALENESS_STATUSES,
    MARKET_INSTRUMENT_TYPES,
    MARKET_VALUATION_MODES,
    hasUsableMarketPrice,
    isFreshMarketData,
    isMarketDataProviderErrorStatus,
    isMarketDataStalenessStatus,
    type MarketDataProviderError,
    type MarketDataQuote,
    type MarketDataRefreshResult,
    type MarketInstrument,
    type PriceSnapshot,
    type ValuationResult,
    type WatchlistItem,
} from '../../types/marketData'

describe('market data shared contracts', () => {
    it('exposes stable enum-like values needed by renderer and Electron main', () => {
        expect(MARKET_INSTRUMENT_TYPES).toEqual(
            expect.arrayContaining([
                'EQUITY',
                'ETF',
                'MUTUAL_FUND',
                'BOND',
                'CRYPTO',
                'OPTION',
                'COMMODITY',
                'FOREX',
                'INDEX',
                'FUND',
                'OTHER',
            ])
        )
        expect(MARKET_DATA_STALENESS_STATUSES).toEqual(
            expect.arrayContaining(['MISSING', 'FRESH', 'STALE', 'EXPIRED', 'UNKNOWN']),
        )
        expect(MARKET_DATA_PROVIDER_ERROR_STATUSES).toEqual(
            expect.arrayContaining([
                'UNKNOWN_SYMBOL',
                'RATE_LIMITED',
                'PROVIDER_UNAVAILABLE',
                'UNSUPPORTED_CURRENCY',
                'INVALID_RESPONSE',
            ]),
        )
        expect(MARKET_VALUATION_MODES).toEqual(
            expect.arrayContaining(['MANUAL', 'LATEST_PRICE', 'HISTORICAL_PRICE', 'FALLBACK_MANUAL']),
        )
    })

    it('represents instruments, quotes, snapshots, watchlist items and valuation results without provider-specific payloads', () => {
        const instrument: MarketInstrument = {
            id: 1,
            symbol: 'AAPL',
            name: 'Apple Inc.',
            type: 'EQUITY',
            currency: 'USD',
            exchangeCode: 'NASDAQ',
            exchangeName: 'Nasdaq',
            identifiers: {isin: null, cusip: null, figi: null},
            providerSymbols: {demo: 'AAPL'},
            isActive: true,
            note: null,
            createdAt: '2026-04-28T12:00:00.000Z',
            updatedAt: '2026-04-28T12:00:00.000Z',
        }

        const quote: MarketDataQuote = {
            providerId: 'demo',
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            unitPrice: 200,
            currency: instrument.currency,
            pricedAt: '2026-04-28T20:00:00.000Z',
            retrievedAt: '2026-04-28T20:01:00.000Z',
            stalenessStatus: 'FRESH',
            timeGranularity: 'DELAYED',
            previousClose: 198,
            change: 2,
            changePercent: 1.01,
        }

        const snapshot: PriceSnapshot = {
            id: 10,
            instrumentId: instrument.id,
            providerId: quote.providerId,
            symbol: quote.symbol,
            unitPrice: quote.unitPrice,
            currency: quote.currency,
            pricedAt: quote.pricedAt,
            retrievedAt: quote.retrievedAt,
            source: 'PROVIDER',
            stalenessStatus: quote.stalenessStatus,
            timeGranularity: quote.timeGranularity,
            note: null,
            createdAt: '2026-04-28T20:01:00.000Z',
            updatedAt: '2026-04-28T20:01:00.000Z',
        }

        const watchlistItem: WatchlistItem = {
            id: 100,
            instrumentId: instrument.id,
            instrument,
            targetCurrency: 'CAD',
            displayOrder: 1,
            lastSnapshot: snapshot,
            stalenessStatus: 'FRESH',
            note: null,
            createdAt: '2026-04-28T20:01:00.000Z',
            updatedAt: '2026-04-28T20:01:00.000Z',
        }

        const valuation: ValuationResult = {
            entityType: 'holdingLot',
            entityId: 500,
            instrumentId: instrument.id,
            quantity: 3,
            currency: 'USD',
            mode: 'LATEST_PRICE',
            unitPrice: snapshot.unitPrice,
            marketValue: 600,
            valueAsOf: snapshot.pricedAt,
            stalenessStatus: snapshot.stalenessStatus,
            usedSnapshot: snapshot,
            error: null,
            warnings: [],
        }

        expect(watchlistItem.lastSnapshot?.source).toBe('PROVIDER')
        expect(valuation.marketValue).toBe(600)
        expect(isFreshMarketData(valuation.stalenessStatus)).toBe(true)
    })

    it('represents absent and stale market data explicitly instead of throwing raw exceptions', () => {
        const providerError: MarketDataProviderError = {
            status: 'UNKNOWN_SYMBOL',
            message: 'Provider could not resolve this symbol.',
            providerId: 'demo',
            symbol: 'NOPE',
            instrumentId: null,
            retryAfterSeconds: null,
            recoverable: false,
        }

        const refresh: MarketDataRefreshResult = {
            status: 'PARTIAL_SUCCESS',
            providerId: 'demo',
            requestedAt: '2026-04-28T20:00:00.000Z',
            completedAt: '2026-04-28T20:01:00.000Z',
            requestedSymbols: ['AAPL', 'NOPE'],
            quotes: [],
            snapshots: [],
            errors: [providerError],
            summary: {requested: 2, succeeded: 1, failed: 1, skipped: 0, stale: 0, missing: 1},
        }

        const missingValuation: ValuationResult = {
            entityType: 'holdingLot',
            entityId: 501,
            instrumentId: null,
            quantity: 1,
            currency: 'USD',
            mode: 'LATEST_PRICE',
            unitPrice: null,
            marketValue: null,
            valueAsOf: null,
            stalenessStatus: 'MISSING',
            usedSnapshot: null,
            error: providerError,
            warnings: ['No usable market price was available.'],
        }

        expect(refresh.errors[0].status).toBe('UNKNOWN_SYMBOL')
        expect(missingValuation.stalenessStatus).toBe('MISSING')
        expect(hasUsableMarketPrice(missingValuation.stalenessStatus)).toBe(false)
    })

    it('narrows incoming string statuses from IPC payloads', () => {
        const stalenessCandidate = 'STALE'
        const errorCandidate = 'RATE_LIMITED'

        expect(isMarketDataStalenessStatus(stalenessCandidate)).toBe(true)
        expect(isMarketDataProviderErrorStatus(errorCandidate)).toBe(true)
        expect(isMarketDataStalenessStatus('BROKEN')).toBe(false)
        expect(isMarketDataProviderErrorStatus('BROKEN')).toBe(false)
    })
})
