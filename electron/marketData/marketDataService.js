const {createProviderError, normalizeProviderError} = require('./providerErrors')
const {createMarketDataProviderRegistry} = require('./providerRegistry')
const {createMockMarketDataProvider} = require('./mockProvider')
const {normalizeProviderQuoteResponse, quoteToPriceSnapshot} = require('./quoteNormalizer')

function normalizeRequests(instruments) {
    if (!Array.isArray(instruments)) return []

    return instruments
        .map((instrument) => ({
            providerId: instrument?.providerId || null,
            instrumentId: Number.isInteger(Number(instrument?.instrumentId ?? instrument?.id))
                ? Number(instrument.instrumentId ?? instrument.id)
                : null,
            symbol: typeof instrument?.symbol === 'string' ? instrument.symbol.trim().toUpperCase() : '',
            currency: typeof instrument?.currency === 'string' ? instrument.currency.trim().toUpperCase() : null,
            pricedAt: instrument?.pricedAt || null,
        }))
        .filter((instrument) => instrument.symbol)
}

function createSummary(requested, quotes, errors, fallbackSnapshots) {
    const missing = Math.max(0, requested - quotes.length - fallbackSnapshots.length)

    return {
        requested,
        succeeded: quotes.length,
        failed: errors.length,
        skipped: 0,
        stale: fallbackSnapshots.length,
        missing,
    }
}

function createRefreshResult({
                                 status,
                                 providerId,
                                 requestedAt,
                                 completedAt,
                                 requests,
                                 quotes,
                                 snapshots,
                                 errors,
                                 usedFallback
                             }) {
    return {
        status,
        providerId: providerId || null,
        requestedAt: requestedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        requestedSymbols: requests.map((request) => request.symbol),
        quotes,
        snapshots,
        errors,
        summary: createSummary(requests.length, quotes, errors, usedFallback ? snapshots : []),
        usedFallback: Boolean(usedFallback),
    }
}

function matchesRequest(snapshot, request) {
    if (!snapshot || !request) return false
    if (request.instrumentId != null && Number(snapshot.instrumentId) === request.instrumentId) return true
    return String(snapshot.symbol || '').toUpperCase() === request.symbol
}

function selectFallbackSnapshots(fallbackSnapshots, requests) {
    if (!Array.isArray(fallbackSnapshots) || fallbackSnapshots.length === 0) return []

    return requests
        .map((request) => fallbackSnapshots.find((snapshot) => matchesRequest(snapshot, request)))
        .filter(Boolean)
}

function computeRefreshStatus(requestCount, quoteCount, errorCount) {
    if (requestCount === 0) return 'SKIPPED'
    if (quoteCount === requestCount && errorCount === 0) return 'SUCCESS'
    if (quoteCount > 0) return 'PARTIAL_SUCCESS'
    return 'FAILED'
}

function shouldMarkProviderFailure(errors, quotes) {
    if (!errors.length) return false
    if (quotes.length === 0) return true
    return errors.some((error) => ['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT'].includes(error.status))
}

async function withTimeout(task, timeoutMs, context = {}) {
    if (!timeoutMs || timeoutMs <= 0) return task()

    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(
                createProviderError('TIMEOUT', `Provider timeout après ${timeoutMs} ms.`, {
                    providerId: context.providerId,
                    recoverable: true,
                }),
            )
        }, timeoutMs)
    })

    try {
        return await Promise.race([task(), timeoutPromise])
    } finally {
        clearTimeout(timeoutId)
    }
}

async function refreshMarketDataQuotes(registry, request = {}, options = {}) {
    const requestedAt = options.now instanceof Date ? options.now : new Date()
    const requests = normalizeRequests(request.instruments)
    const providerId = request.providerId || registry.getActiveProviderId()

    if (requests.length === 0) {
        return createRefreshResult({
            status: 'SKIPPED',
            providerId,
            requestedAt,
            completedAt: options.now instanceof Date ? options.now : new Date(),
            requests,
            quotes: [],
            snapshots: [],
            errors: [],
            usedFallback: false,
        })
    }

    let provider
    try {
        provider = registry.requireProvider(providerId)
    } catch (error) {
        const normalizedError = normalizeProviderError(error, {providerId})
        const fallbackSnapshots = selectFallbackSnapshots(request.fallbackSnapshots, requests)
        return createRefreshResult({
            status: 'FAILED',
            providerId,
            requestedAt,
            completedAt: options.now instanceof Date ? options.now : new Date(),
            requests,
            quotes: [],
            snapshots: fallbackSnapshots,
            errors: [normalizedError],
            usedFallback: fallbackSnapshots.length > 0,
        })
    }

    if (!registry.isProviderAvailable(provider.id, requestedAt)) {
        const normalizedError = normalizeProviderError(
            createProviderError('PROVIDER_UNAVAILABLE', `Le provider ${provider.id} est temporairement en cooldown.`, {
                providerId: provider.id,
                recoverable: true,
            }),
            {providerId: provider.id},
        )
        const fallbackSnapshots = selectFallbackSnapshots(request.fallbackSnapshots, requests)
        return createRefreshResult({
            status: 'FAILED',
            providerId: provider.id,
            requestedAt,
            completedAt: options.now instanceof Date ? options.now : new Date(),
            requests,
            quotes: [],
            snapshots: fallbackSnapshots,
            errors: [normalizedError],
            usedFallback: fallbackSnapshots.length > 0,
        })
    }

    try {
        const timeoutMs = Number(request.timeoutMs ?? registry.getConfig().timeoutMs)
        const response = await withTimeout(
            () =>
                provider.getQuotes(requests, {
                    providerId: provider.id,
                    timeoutMs,
                    now: requestedAt,
                }),
            timeoutMs,
            {providerId: provider.id},
        )
        const {quotes, errors} = normalizeProviderQuoteResponse(response, requests, {
            providerId: provider.id,
            now: requestedAt,
        })
        const snapshots = quotes.map((quote) => quoteToPriceSnapshot(quote, {now: requestedAt}))

        if (shouldMarkProviderFailure(errors, quotes)) {
            registry.markFailure(provider.id, errors[0], requestedAt)
        } else {
            registry.markSuccess(provider.id, requestedAt)
        }

        return createRefreshResult({
            status: computeRefreshStatus(requests.length, quotes.length, errors.length),
            providerId: provider.id,
            requestedAt,
            completedAt: options.now instanceof Date ? options.now : new Date(),
            requests,
            quotes,
            snapshots,
            errors,
            usedFallback: false,
        })
    } catch (error) {
        const normalizedError = normalizeProviderError(error, {providerId: provider.id})
        registry.markFailure(provider.id, normalizedError, requestedAt)

        const fallbackSnapshots = selectFallbackSnapshots(request.fallbackSnapshots, requests)
        return createRefreshResult({
            status: 'FAILED',
            providerId: provider.id,
            requestedAt,
            completedAt: options.now instanceof Date ? options.now : new Date(),
            requests,
            quotes: [],
            snapshots: fallbackSnapshots,
            errors: [normalizedError],
            usedFallback: fallbackSnapshots.length > 0,
        })
    }
}

function createMarketDataService(options = {}) {
    const registry =
        options.registry ||
        createMarketDataProviderRegistry({
            providers: [createMockMarketDataProvider()],
            activeProviderId: 'mock-local',
            ...options.registryConfig,
        })

    return {
        registry,
        getProviderConfig: () => registry.getConfig(),
        setProviderConfig: (config) => registry.setConfig(config),
        listProviders: (listOptions) => registry.list(listOptions),
        refreshQuotes: (request, refreshOptions) => refreshMarketDataQuotes(registry, request, refreshOptions),
    }
}

module.exports = {
    createMarketDataService,
    refreshMarketDataQuotes,
}
