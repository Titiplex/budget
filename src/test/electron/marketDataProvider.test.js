import {describe, expect, it} from "vitest";

const {
    createMarketDataProviderRegistry,
    createMarketDataService,
    createMockMarketDataProvider,
    createProviderError,
    normalizeProviderError,
    normalizeProviderQuoteResponse,
    refreshMarketDataQuotes,
} = require('../../../electron/marketData')

describe('market data provider abstraction', () => {
    it('keeps provider selection behind a registry with explicit active-provider config', () => {
        const provider = createMockMarketDataProvider({id: 'mock-dev'})
        const registry = createMarketDataProviderRegistry({providers: [provider]})

        expect(registry.getActiveProviderId()).toBe('mock-dev')
        expect(registry.list()).toHaveLength(1)
        expect(registry.getActiveProvider().id).toBe('mock-dev')

        const secondProvider = createMockMarketDataProvider({id: 'mock-secondary', priority: 10})
        registry.register(secondProvider)
        registry.setActiveProviderId('mock-secondary')

        expect(registry.getConfig().activeProviderId).toBe('mock-secondary')
        expect(registry.list().map((item) => item.id)).toEqual(['mock-dev', 'mock-secondary'])
    })

    it('refreshes quotes through the mock provider without touching the network', async () => {
        const registry = createMarketDataProviderRegistry({
            providers: [
                createMockMarketDataProvider({
                    id: 'mock-local',
                    quotes: {
                        XEQT: {unitPrice: 34.12, currency: 'CAD', pricedAt: '2026-04-28T18:00:00.000Z'},
                    },
                }),
            ],
            activeProviderId: 'mock-local',
        })

        const result = await refreshMarketDataQuotes(registry, {
            instruments: [{instrumentId: 12, symbol: 'xeqt', currency: 'CAD'}],
        })

        expect(result.status).toBe('SUCCESS')
        expect(result.providerId).toBe('mock-local')
        expect(result.quotes[0]).toMatchObject({
            providerId: 'mock-local',
            instrumentId: 12,
            symbol: 'XEQT',
            unitPrice: 34.12,
            currency: 'CAD',
        })
        expect(result.snapshots[0]).toMatchObject({
            source: 'PROVIDER',
            symbol: 'XEQT',
            unitPrice: 34.12,
        })
        expect(result.errors).toEqual([])
    })

    it('normalizes partial provider responses instead of leaking provider-specific payloads', () => {
        const normalized = normalizeProviderQuoteResponse(
            {
                quotes: [{ticker: 'ignored'}, {symbol: 'AAPL', price: 200, currency: 'USD'}],
                errors: [createProviderError('UNKNOWN_SYMBOL', 'NOPE is unknown', {
                    symbol: 'NOPE',
                    providerId: 'demo'
                })],
            },
            [
                {symbol: 'BAD', currency: 'USD'},
                {symbol: 'AAPL', currency: 'USD'},
            ],
            {providerId: 'demo', now: new Date('2026-04-28T20:00:00.000Z')},
        )

        expect(normalized.quotes).toHaveLength(1)
        expect(normalized.quotes[0].symbol).toBe('AAPL')
        expect(normalized.errors.map((error) => error.status)).toEqual(['INVALID_RESPONSE', 'UNKNOWN_SYMBOL'])
    })

    it('normalizes thrown provider errors and keeps the latest local snapshot as fallback', async () => {
        const registry = createMarketDataProviderRegistry({
            providers: [
                createMockMarketDataProvider({
                    id: 'mock-rate-limited',
                    failWith: {status: 'RATE_LIMITED', message: 'Too many requests', retryAfterSeconds: 30},
                }),
            ],
            activeProviderId: 'mock-rate-limited',
            rateLimitCooldownMs: 1000,
        })
        const fallbackSnapshot = {
            id: 5,
            instrumentId: 9,
            providerId: 'mock-rate-limited',
            symbol: 'AAPL',
            unitPrice: 190,
            currency: 'USD',
            pricedAt: '2026-04-27T20:00:00.000Z',
            retrievedAt: '2026-04-27T20:01:00.000Z',
            source: 'PROVIDER',
            stalenessStatus: 'STALE',
            timeGranularity: 'DELAYED',
            note: null,
            createdAt: '2026-04-27T20:01:00.000Z',
            updatedAt: '2026-04-27T20:01:00.000Z',
        }

        const result = await refreshMarketDataQuotes(registry, {
            instruments: [{instrumentId: 9, symbol: 'AAPL', currency: 'USD'}],
            fallbackSnapshots: [fallbackSnapshot],
        })

        expect(result.status).toBe('FAILED')
        expect(result.usedFallback).toBe(true)
        expect(result.snapshots).toEqual([fallbackSnapshot])
        expect(result.errors[0]).toMatchObject({
            status: 'RATE_LIMITED',
            providerId: 'mock-rate-limited',
            retryAfterSeconds: 30,
            recoverable: true,
        })
        expect(registry.isProviderAvailable('mock-rate-limited')).toBe(false)
    })

    it('turns slow providers into timeout errors without throwing to the caller', async () => {
        const registry = createMarketDataProviderRegistry({
            providers: [createMockMarketDataProvider({id: 'slow-mock', latencyMs: 20})],
            activeProviderId: 'slow-mock',
            timeoutMs: 1,
            maxFailuresBeforeCooldown: 1,
            failureCooldownMs: 1000,
        })

        const result = await refreshMarketDataQuotes(registry, {
            instruments: [{symbol: 'AAPL', currency: 'USD'}],
        })

        expect(result.status).toBe('FAILED')
        expect(result.errors[0].status).toBe('TIMEOUT')
        expect(result.errors[0].recoverable).toBe(true)
        expect(registry.getProviderRuntimeState('slow-mock').consecutiveFailures).toBe(1)
    })

    it('ships a service with a local mock provider for development by default', async () => {
        const service = createMarketDataService()

        expect(service.getProviderConfig().activeProviderId).toBe('mock-local')
        expect(service.listProviders()[0].id).toBe('mock-local')

        const result = await service.refreshQuotes({
            instruments: [{symbol: 'AAPL', currency: 'USD'}],
        })

        expect(result.status).toBe('SUCCESS')
        expect(result.quotes[0].symbol).toBe('AAPL')
    })

    it('maps common transport failures to structured app errors', () => {
        expect(normalizeProviderError({statusCode: 429, message: 'rate limited'}, {providerId: 'demo'})).toMatchObject({
            status: 'RATE_LIMITED',
            providerId: 'demo',
            recoverable: true,
        })
        expect(normalizeProviderError({code: 'ECONNRESET'}, {providerId: 'demo'}).status).toBe('NETWORK_ERROR')
        expect(normalizeProviderError({name: 'AbortError'}, {providerId: 'demo'}).status).toBe('TIMEOUT')
    })
})
