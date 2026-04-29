const {createValuationError} = require('./valuationErrors')

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCurrency(value, fieldName = 'La devise') {
    const currency = normalizeText(value)?.toUpperCase()
    if (!currency) {
        throw createValuationError('INVALID_CURRENCY', `${fieldName} est obligatoire.`)
    }
    return currency
}

function normalizeAmount(value, fieldName = 'Le montant') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        throw createValuationError('INVALID_PRICE', `${fieldName} doit être un nombre valide.`)
    }
    return parsed
}

function normalizeRate(value) {
    const rawRate = value && typeof value === 'object' ? value.rate : value
    const rate = Number(rawRate)
    return Number.isFinite(rate) && rate > 0 ? rate : null
}

function normalizeDate(value, fallback = new Date()) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = candidate instanceof Date ? new Date(candidate.getTime()) : new Date(candidate)
    if (Number.isNaN(parsed.getTime())) return fallback
    return parsed
}

function createFxPairKey(from, to) {
    return `${normalizeCurrency(from, 'La devise source')}:${normalizeCurrency(to, 'La devise cible')}`
}

function getRateFromStaticRates(rates, from, to) {
    if (!rates) return null
    const directKey = createFxPairKey(from, to)
    const inverseKey = createFxPairKey(to, from)
    const directValue = rates instanceof Map ? rates.get(directKey) : rates[directKey]
    const directRate = normalizeRate(directValue)
    if (directRate) {
        return {rate: directRate, provider: directValue?.provider || 'STATIC', date: directValue?.date || null}
    }

    const inverseValue = rates instanceof Map ? rates.get(inverseKey) : rates[inverseKey]
    const inverseRate = normalizeRate(inverseValue)
    if (inverseRate) {
        return {
            rate: 1 / inverseRate,
            provider: inverseValue?.provider || 'STATIC_INVERSE',
            date: inverseValue?.date || null
        }
    }

    return null
}

function normalizeFxResponse(response, amount, from, to, date) {
    if (!response) return null
    const rate = normalizeRate(response)
    if (!rate) return null
    const convertedAmount = Number(response.convertedAmount ?? amount * rate)
    if (!Number.isFinite(convertedAmount)) return null
    return {
        from,
        to,
        rate,
        convertedAmount,
        provider: normalizeText(response.provider) || 'CUSTOM',
        date: normalizeText(response.date) || date.toISOString().slice(0, 10),
    }
}

async function resolveFxRate({amount, from, to, date}, options = {}) {
    const normalizedAmount = normalizeAmount(amount)
    const sourceCurrency = normalizeCurrency(from, 'La devise source')
    const targetCurrency = normalizeCurrency(to, 'La devise cible')
    const valuationDate = normalizeDate(date)

    if (sourceCurrency === targetCurrency) {
        return {
            from: sourceCurrency,
            to: targetCurrency,
            rate: 1,
            convertedAmount: normalizedAmount,
            provider: 'ACCOUNT',
            date: valuationDate.toISOString().slice(0, 10),
        }
    }

    const staticRate = getRateFromStaticRates(options.rates, sourceCurrency, targetCurrency)
    if (staticRate) {
        return {
            from: sourceCurrency,
            to: targetCurrency,
            rate: staticRate.rate,
            convertedAmount: normalizedAmount * staticRate.rate,
            provider: staticRate.provider,
            date: staticRate.date || valuationDate.toISOString().slice(0, 10),
        }
    }

    if (typeof options.resolver === 'function') {
        const resolved = await options.resolver({
            amount: normalizedAmount,
            from: sourceCurrency,
            to: targetCurrency,
            date: valuationDate.toISOString().slice(0, 10),
        })
        const normalized = normalizeFxResponse(resolved, normalizedAmount, sourceCurrency, targetCurrency, valuationDate)
        if (normalized) return normalized
    }

    throw createValuationError(
        'FX_RATE_UNAVAILABLE',
        `Aucun taux FX disponible pour ${sourceCurrency} → ${targetCurrency}.`,
        {currency: targetCurrency},
    )
}

async function convertAmountWithFx({amount, from, to, date}, options = {}) {
    return resolveFxRate({amount, from, to, date}, options)
}

function createStaticFxRateResolver(rates = {}) {
    return async ({amount, from, to, date}) => {
        const sourceCurrency = normalizeCurrency(from, 'La devise source')
        const targetCurrency = normalizeCurrency(to, 'La devise cible')
        const valuationDate = normalizeDate(date)
        const normalizedAmount = normalizeAmount(amount)
        const staticRate = getRateFromStaticRates(rates, sourceCurrency, targetCurrency)
        if (!staticRate) return null
        return {
            from: sourceCurrency,
            to: targetCurrency,
            rate: staticRate.rate,
            convertedAmount: normalizedAmount * staticRate.rate,
            provider: staticRate.provider,
            date: staticRate.date || valuationDate.toISOString().slice(0, 10),
        }
    }
}

module.exports = {
    convertAmountWithFx,
    createFxPairKey,
    createStaticFxRateResolver,
    resolveFxRate,
}
