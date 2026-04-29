const MARKET_VALUATION_ERROR_CODES = [
    'INSTRUMENT_REQUIRED',
    'SNAPSHOT_UNAVAILABLE',
    'MANUAL_VALUE_UNAVAILABLE',
    'INVALID_QUANTITY',
    'INVALID_PRICE',
    'INVALID_CURRENCY',
    'FX_RATE_UNAVAILABLE',
    'REPOSITORY_ERROR',
    'UNKNOWN_ERROR',
]

const RECOVERABLE_VALUATION_CODES = new Set([
    'SNAPSHOT_UNAVAILABLE',
    'MANUAL_VALUE_UNAVAILABLE',
    'FX_RATE_UNAVAILABLE',
    'REPOSITORY_ERROR',
    'UNKNOWN_ERROR',
])

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCurrency(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function normalizeId(value) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isMarketValuationErrorCode(value) {
    return MARKET_VALUATION_ERROR_CODES.includes(value)
}

function defaultValuationErrorMessage(code) {
    switch (code) {
        case 'INSTRUMENT_REQUIRED':
            return 'Un instrument de marché est requis pour calculer cette valorisation.'
        case 'SNAPSHOT_UNAVAILABLE':
            return 'Aucun snapshot de prix exploitable n’est disponible.'
        case 'MANUAL_VALUE_UNAVAILABLE':
            return 'Aucune valeur manuelle de fallback n’est disponible.'
        case 'INVALID_QUANTITY':
            return 'La quantité à valoriser est invalide.'
        case 'INVALID_PRICE':
            return 'Le prix à utiliser pour la valorisation est invalide.'
        case 'INVALID_CURRENCY':
            return 'La devise de valorisation est invalide.'
        case 'FX_RATE_UNAVAILABLE':
            return 'Le taux de change nécessaire à la valorisation est indisponible.'
        case 'REPOSITORY_ERROR':
            return 'La lecture ou l’écriture des snapshots de prix a échoué.'
        default:
            return 'Une erreur inconnue est survenue pendant la valorisation.'
    }
}

class MarketValuationError extends Error {
    constructor(code, message, options = {}) {
        const normalizedCode = isMarketValuationErrorCode(code) ? code : 'UNKNOWN_ERROR'
        super(normalizeText(message) || defaultValuationErrorMessage(normalizedCode))
        this.name = 'MarketValuationError'
        this.code = normalizedCode
        this.entityType = normalizeText(options.entityType)
        this.entityId = normalizeId(options.entityId)
        this.instrumentId = normalizeId(options.instrumentId)
        this.currency = normalizeCurrency(options.currency)
        this.recoverable =
            typeof options.recoverable === 'boolean'
                ? options.recoverable
                : RECOVERABLE_VALUATION_CODES.has(normalizedCode)
        this.cause = options.cause
    }

    toJSON() {
        return toValuationErrorObject(this)
    }
}

function toValuationErrorObject(error) {
    const code = isMarketValuationErrorCode(error?.code) ? error.code : 'UNKNOWN_ERROR'
    return {
        code,
        message: normalizeText(error?.message) || defaultValuationErrorMessage(code),
        entityType: normalizeText(error?.entityType),
        entityId: normalizeId(error?.entityId),
        instrumentId: normalizeId(error?.instrumentId),
        currency: normalizeCurrency(error?.currency),
        recoverable:
            typeof error?.recoverable === 'boolean'
                ? error.recoverable
                : RECOVERABLE_VALUATION_CODES.has(code),
    }
}

function createValuationError(code, message, options = {}) {
    return new MarketValuationError(code, message, options)
}

function inferValuationErrorCode(error) {
    if (!error) return 'UNKNOWN_ERROR'
    if (isMarketValuationErrorCode(error.code)) return error.code
    if (isMarketValuationErrorCode(error.status)) return error.status
    return 'UNKNOWN_ERROR'
}

function normalizeValuationError(error, context = {}) {
    if (error instanceof MarketValuationError) {
        return toValuationErrorObject({
            code: error.code,
            message: error.message,
            entityType: error.entityType || context.entityType,
            entityId: error.entityId || context.entityId,
            instrumentId: error.instrumentId || context.instrumentId,
            currency: error.currency || context.currency,
            recoverable: error.recoverable,
        })
    }

    const code = inferValuationErrorCode(error)
    return toValuationErrorObject({
        code,
        message: normalizeText(error?.message) || defaultValuationErrorMessage(code),
        entityType: error?.entityType || context.entityType,
        entityId: error?.entityId || context.entityId,
        instrumentId: error?.instrumentId || context.instrumentId,
        currency: error?.currency || context.currency,
        recoverable: typeof error?.recoverable === 'boolean' ? error.recoverable : undefined,
    })
}

module.exports = {
    MARKET_VALUATION_ERROR_CODES,
    MarketValuationError,
    createValuationError,
    defaultValuationErrorMessage,
    isMarketValuationErrorCode,
    normalizeValuationError,
    toValuationErrorObject,
}
