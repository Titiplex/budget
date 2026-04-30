const {createProviderError, normalizeProviderError} = require('./providerErrors')

const STALENESS_STATUSES = ['MISSING', 'FRESH', 'STALE', 'EXPIRED', 'UNKNOWN']
const TIME_GRANULARITIES = ['REAL_TIME', 'DELAYED', 'END_OF_DAY', 'HISTORICAL', 'UNKNOWN']

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeSymbol(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function normalizeCurrency(value, fallback = null) {
    return (normalizeText(value) || fallback || '').toUpperCase() || null
}

function optionalNumber(value) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function requirePositiveNumber(value, fieldName, context) {
    const parsed = optionalNumber(value)
    if (parsed == null || parsed <= 0) {
        throw createProviderError('INVALID_RESPONSE', `${fieldName} doit être un nombre strictement positif.`, context)
    }
    return parsed
}

function normalizeIsoDateTime(value, fieldName, context, fallback = null) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = candidate instanceof Date ? new Date(candidate.getTime()) : new Date(candidate)

    if (Number.isNaN(parsed.getTime())) {
        throw createProviderError('INVALID_RESPONSE', `${fieldName} est invalide.`, context)
    }

    return parsed.toISOString()
}

function normalizeStalenessStatus(value) {
    return STALENESS_STATUSES.includes(value) ? value : 'UNKNOWN'
}

function normalizeTimeGranularity(value) {
    return TIME_GRANULARITIES.includes(value) ? value : 'UNKNOWN'
}

function normalizeMarketDataQuote(rawQuote, request = {}, context = {}) {
    const raw = rawQuote || {}
    const providerId = normalizeText(raw.providerId) || normalizeText(context.providerId) || normalizeText(request.providerId)
    const symbol = normalizeSymbol(raw.symbol) || normalizeSymbol(request.symbol)
    const instrumentId = Number.isInteger(Number(raw.instrumentId ?? request.instrumentId))
        ? Number(raw.instrumentId ?? request.instrumentId)
        : null
    const errorContext = {providerId, symbol, instrumentId}

    if (!symbol) {
        throw createProviderError('INVALID_RESPONSE', 'Le symbole de la quote est obligatoire.', errorContext)
    }

    const currency = normalizeCurrency(raw.currency, request.currency)
    if (!currency) {
        throw createProviderError('INVALID_RESPONSE', 'La devise de la quote est obligatoire.', errorContext)
    }

    const unitPrice = requirePositiveNumber(raw.unitPrice ?? raw.price ?? raw.close, 'Le prix unitaire', errorContext)
    const now = context.now instanceof Date ? context.now : new Date()

    return {
        providerId: providerId || null,
        instrumentId,
        symbol,
        unitPrice,
        currency,
        pricedAt: normalizeIsoDateTime(raw.pricedAt ?? raw.asOf ?? raw.timestamp, 'La date de prix', errorContext, now),
        retrievedAt: normalizeIsoDateTime(raw.retrievedAt, 'La date de récupération', errorContext, now),
        stalenessStatus: normalizeStalenessStatus(raw.stalenessStatus),
        timeGranularity: normalizeTimeGranularity(raw.timeGranularity),
        previousClose: optionalNumber(raw.previousClose),
        change: optionalNumber(raw.change),
        changePercent: optionalNumber(raw.changePercent),
    }
}

function normalizeProviderQuoteResponse(response, requests = [], context = {}) {
    const rawQuotes = Array.isArray(response) ? response : Array.isArray(response?.quotes) ? response.quotes : []
    const rawErrors = Array.isArray(response?.errors) ? response.errors : []
    const quotes = []
    const errors = []

    rawQuotes.forEach((quote, index) => {
        const request = requests[index] || requests.find((candidate) => normalizeSymbol(candidate.symbol) === normalizeSymbol(quote?.symbol)) || {}
        try {
            quotes.push(normalizeMarketDataQuote(quote, request, context))
        } catch (error) {
            errors.push(normalizeProviderError(error, {...context, symbol: quote?.symbol || request.symbol}))
        }
    })

    rawErrors.forEach((error) => {
        errors.push(normalizeProviderError(error, context))
    })

    return {quotes, errors}
}

function quoteToPriceSnapshot(quote, options = {}) {
    const now = options.now instanceof Date ? options.now.toISOString() : new Date().toISOString()

    return {
        id: options.id ?? null,
        instrumentId: quote.instrumentId,
        providerId: quote.providerId,
        symbol: quote.symbol,
        unitPrice: quote.unitPrice,
        currency: quote.currency,
        pricedAt: quote.pricedAt,
        retrievedAt: quote.retrievedAt,
        source: 'PROVIDER',
        stalenessStatus: quote.stalenessStatus,
        timeGranularity: quote.timeGranularity,
        note: options.note || null,
        createdAt: options.createdAt || now,
        updatedAt: options.updatedAt || now,
    }
}

module.exports = {
    STALENESS_STATUSES,
    TIME_GRANULARITIES,
    normalizeCurrency,
    normalizeMarketDataQuote,
    normalizeProviderQuoteResponse,
    normalizeSymbol,
    quoteToPriceSnapshot,
}
