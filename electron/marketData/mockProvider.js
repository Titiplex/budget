const {createProviderError, toProviderErrorObject} = require('./providerErrors')
const {normalizeCurrency, normalizeSymbol} = require('./quoteNormalizer')

function delay(ms) {
    if (!ms) return Promise.resolve()
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeQuoteBook(quotes) {
    const entries = quotes instanceof Map ? [...quotes.entries()] : Object.entries(quotes || {})
    const normalized = new Map()

    entries.forEach(([symbol, quote]) => {
        const normalizedSymbol = normalizeSymbol(symbol || quote?.symbol)
        if (!normalizedSymbol) return
        normalized.set(normalizedSymbol, {...quote, symbol: normalizedSymbol})
    })

    return normalized
}

function createMockMarketDataProvider(options = {}) {
    const quoteBook = normalizeQuoteBook(
        options.quotes || {
            AAPL: {unitPrice: 200, currency: 'USD', timeGranularity: 'DELAYED', stalenessStatus: 'FRESH'},
            CASHCAD: {unitPrice: 1, currency: 'CAD', timeGranularity: 'REAL_TIME', stalenessStatus: 'FRESH'},
            XEQT: {unitPrice: 33.25, currency: 'CAD', timeGranularity: 'DELAYED', stalenessStatus: 'FRESH'},
        },
    )

    const providerId = options.id || 'mock-local'

    return {
        id: providerId,
        name: options.name || 'Mock local market data provider',
        enabled: options.enabled !== false,
        supportsSearch: true,
        supportsBatchQuotes: true,
        supportsHistoricalQuotes: false,
        supportedInstrumentTypes: options.supportedInstrumentTypes || ['EQUITY', 'ETF', 'CASH', 'CRYPTO', 'OTHER'],
        supportedCurrencies: options.supportedCurrencies || null,
        priority: Number.isFinite(Number(options.priority)) ? Number(options.priority) : 1,
        rateLimit: null,

        async getQuotes(requests = [], context = {}) {
            await delay(options.latencyMs || 0)

            if (options.failWith) {
                const failure =
                    options.failWith instanceof Error
                        ? options.failWith
                        : createProviderError(options.failWith.status || options.failWith, options.failWith.message, {
                            ...options.failWith,
                            providerId,
                        })
                throw failure
            }

            const now = context.now instanceof Date ? context.now.toISOString() : new Date().toISOString()
            const quotes = []
            const errors = []

            requests.forEach((request) => {
                const symbol = normalizeSymbol(request?.symbol)
                if (!symbol) {
                    errors.push(
                        toProviderErrorObject(
                            createProviderError('INVALID_RESPONSE', 'Le symbole demandé est obligatoire.', {providerId}),
                        ),
                    )
                    return
                }

                const quote = quoteBook.get(symbol)
                if (!quote) {
                    errors.push(
                        toProviderErrorObject(
                            createProviderError('UNKNOWN_SYMBOL', `Le provider mock ne connaît pas ${symbol}.`, {
                                providerId,
                                symbol,
                                instrumentId: request.instrumentId,
                                recoverable: false,
                            }),
                        ),
                    )
                    return
                }

                quotes.push({
                    providerId,
                    instrumentId: request.instrumentId ?? quote.instrumentId ?? null,
                    symbol,
                    unitPrice: quote.unitPrice ?? quote.price,
                    currency: normalizeCurrency(request.currency, quote.currency || 'USD'),
                    pricedAt: quote.pricedAt || now,
                    retrievedAt: now,
                    stalenessStatus: quote.stalenessStatus || 'FRESH',
                    timeGranularity: quote.timeGranularity || 'DELAYED',
                    previousClose: quote.previousClose ?? null,
                    change: quote.change ?? null,
                    changePercent: quote.changePercent ?? null,
                })
            })

            return {quotes, errors}
        },

        async search(query) {
            const normalizedQuery = String(query || '').trim().toUpperCase()
            if (!normalizedQuery) return []

            return [...quoteBook.values()]
                .filter((quote) => quote.symbol.includes(normalizedQuery) || String(quote.name || '').toUpperCase().includes(normalizedQuery))
                .map((quote) => ({
                    symbol: quote.symbol,
                    name: quote.name || quote.symbol,
                    currency: normalizeCurrency(quote.currency, 'USD'),
                    type: quote.type || 'OTHER',
                }))
        },
    }
}

module.exports = {createMockMarketDataProvider}
