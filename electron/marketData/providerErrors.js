const PROVIDER_ERROR_STATUSES = [
    'UNKNOWN_SYMBOL',
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
    'UNSUPPORTED_CURRENCY',
    'INVALID_RESPONSE',
    'NETWORK_ERROR',
    'TIMEOUT',
    'UNKNOWN_ERROR',
]

const RECOVERABLE_STATUSES = new Set([
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
    'NETWORK_ERROR',
    'TIMEOUT',
    'UNKNOWN_ERROR',
])

const NETWORK_ERROR_CODES = new Set([
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENETDOWN',
    'ENETRESET',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
])

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeProviderId(value) {
    return normalizeText(value) || null
}

function normalizeSymbol(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function isProviderErrorStatus(value) {
    return PROVIDER_ERROR_STATUSES.includes(value)
}

function normalizeRetryAfterSeconds(value) {
    if (value == null || value === '') return null

    if (value instanceof Date) {
        const seconds = Math.ceil((value.getTime() - Date.now()) / 1000)
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null
    }

    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed

    const parsedDate = Date.parse(String(value))
    if (!Number.isNaN(parsedDate)) {
        const seconds = Math.ceil((parsedDate - Date.now()) / 1000)
        return seconds > 0 ? seconds : null
    }

    return null
}

function defaultProviderMessage(status) {
    switch (status) {
        case 'UNKNOWN_SYMBOL':
            return 'Le symbole est inconnu du provider de données de marché.'
        case 'RATE_LIMITED':
            return 'Le provider de données de marché a refusé la requête à cause du rate-limit.'
        case 'PROVIDER_UNAVAILABLE':
            return 'Le provider de données de marché est indisponible.'
        case 'UNSUPPORTED_CURRENCY':
            return 'La devise demandée n’est pas supportée par le provider.'
        case 'INVALID_RESPONSE':
            return 'Le provider a renvoyé une réponse invalide.'
        case 'NETWORK_ERROR':
            return 'La connexion au provider de données de marché a échoué.'
        case 'TIMEOUT':
            return 'Le provider de données de marché n’a pas répondu à temps.'
        default:
            return 'Une erreur inconnue est survenue avec le provider de données de marché.'
    }
}

function inferStatus(error) {
    if (!error) return 'UNKNOWN_ERROR'

    if (isProviderErrorStatus(error.status)) return error.status
    if (isProviderErrorStatus(error.code)) return error.code

    const httpStatus = Number(error.httpStatus || error.statusCode || error.response?.status)
    if (httpStatus === 429) return 'RATE_LIMITED'
    if (httpStatus === 404) return 'UNKNOWN_SYMBOL'
    if (httpStatus === 408 || httpStatus === 504) return 'TIMEOUT'
    if (httpStatus >= 500) return 'PROVIDER_UNAVAILABLE'

    if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return 'TIMEOUT'
    if (NETWORK_ERROR_CODES.has(error.code)) return error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'NETWORK_ERROR'

    return 'UNKNOWN_ERROR'
}

class MarketDataProviderError extends Error {
    constructor(status, message, options = {}) {
        const normalizedStatus = isProviderErrorStatus(status) ? status : 'UNKNOWN_ERROR'
        super(normalizeText(message) || defaultProviderMessage(normalizedStatus))

        this.name = 'MarketDataProviderError'
        this.status = normalizedStatus
        this.providerId = normalizeProviderId(options.providerId)
        this.symbol = normalizeSymbol(options.symbol)
        this.instrumentId = Number.isInteger(Number(options.instrumentId)) ? Number(options.instrumentId) : null
        this.retryAfterSeconds = normalizeRetryAfterSeconds(options.retryAfterSeconds)
        this.recoverable =
            typeof options.recoverable === 'boolean'
                ? options.recoverable
                : RECOVERABLE_STATUSES.has(normalizedStatus)
        this.cause = options.cause
    }

    toJSON() {
        return toProviderErrorObject(this)
    }
}

function toProviderErrorObject(error) {
    const status = isProviderErrorStatus(error?.status) ? error.status : 'UNKNOWN_ERROR'

    return {
        status,
        message: normalizeText(error?.message) || defaultProviderMessage(status),
        providerId: normalizeProviderId(error?.providerId),
        symbol: normalizeSymbol(error?.symbol),
        instrumentId: Number.isInteger(Number(error?.instrumentId)) ? Number(error.instrumentId) : null,
        retryAfterSeconds: normalizeRetryAfterSeconds(error?.retryAfterSeconds),
        recoverable:
            typeof error?.recoverable === 'boolean' ? error.recoverable : RECOVERABLE_STATUSES.has(status),
    }
}

function createProviderError(status, message, options = {}) {
    return new MarketDataProviderError(status, message, options)
}

function normalizeProviderError(error, context = {}) {
    if (error instanceof MarketDataProviderError) {
        return toProviderErrorObject({
            ...error,
            providerId: error.providerId || context.providerId,
            symbol: error.symbol || context.symbol,
            instrumentId: error.instrumentId || context.instrumentId,
        })
    }

    const status = inferStatus(error)
    const retryAfterSeconds = normalizeRetryAfterSeconds(
        error?.retryAfterSeconds ||
        error?.retryAfter ||
        error?.response?.headers?.['retry-after'] ||
        error?.response?.headers?.get?.('retry-after') ||
        context.retryAfterSeconds,
    )

    return toProviderErrorObject({
        status,
        message: normalizeText(error?.message) || defaultProviderMessage(status),
        providerId: error?.providerId || context.providerId,
        symbol: error?.symbol || context.symbol,
        instrumentId: error?.instrumentId || context.instrumentId,
        retryAfterSeconds,
        recoverable: typeof error?.recoverable === 'boolean' ? error.recoverable : undefined,
    })
}

function isRecoverableProviderStatus(status) {
    return RECOVERABLE_STATUSES.has(status)
}

module.exports = {
    MarketDataProviderError,
    PROVIDER_ERROR_STATUSES,
    createProviderError,
    defaultProviderMessage,
    isProviderErrorStatus,
    isRecoverableProviderStatus,
    normalizeProviderError,
    normalizeRetryAfterSeconds,
    toProviderErrorObject,
}
