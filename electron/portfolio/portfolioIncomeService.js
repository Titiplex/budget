const {convertAmountWithFx} = require('../marketData/fxConversion')
const {roundMoney} = require('./portfolioValuationService')

const INCOME_TYPES = new Set(['DIVIDEND', 'INTEREST', 'DISTRIBUTION', 'CAPITAL_RETURN'])
const TRADE_TYPES = new Set(['BUY', 'SELL'])
const FEE_TYPES = new Set([
    'FEE',
    'BROKERAGE_FEE',
    'BUY_FEE',
    'SELL_FEE',
    'CUSTODY_FEE',
    'MANAGEMENT_FEE',
    'MISC_FEE',
])

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const maybeNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const currency = (value, fallback = 'CAD') => (text(value) || fallback).toUpperCase()

function normalizeDate(value, fallback = new Date()) {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value == null || value === '' ? fallback : value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function isoDate(value, fallback = new Date()) {
    return normalizeDate(value, fallback).toISOString().slice(0, 10)
}

function startOfMonth(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function startOfNextMonth(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
}

function startOfYear(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
}

function startOfNextYear(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1))
}

function resolvePeriod(options = {}) {
    const now = normalizeDate(options.now || new Date())
    const period = text(options.period || options.periodPreset || 'custom') || 'custom'

    if (period === 'currentMonth') {
        return {period, startDate: startOfMonth(now), endDate: startOfNextMonth(now)}
    }
    if (period === 'currentYear') {
        return {period, startDate: startOfYear(now), endDate: startOfNextYear(now)}
    }

    const startDate = options.startDate ? normalizeDate(options.startDate) : new Date(Date.UTC(1970, 0, 1))
    const endDate = options.endDate ? normalizeDate(options.endDate) : new Date(Date.UTC(9999, 11, 31))
    return {period: 'custom', startDate, endDate}
}

function movementDate(movement) {
    return movement.paidAt || movement.chargedAt || movement.operationDate || movement.tradeDate || movement.date || movement.createdAt
}

function movementType(movement) {
    return (text(movement.type) || 'UNKNOWN').toUpperCase()
}

function isInPeriod(movement, period) {
    const value = normalizeDate(movementDate(movement), period.startDate)
    return value.getTime() >= period.startDate.getTime() && value.getTime() < period.endDate.getTime()
}

function normalizeIncomeKind(type) {
    if (type === 'DIVIDEND') return 'dividend'
    if (type === 'INTEREST') return 'interest'
    if (type === 'DISTRIBUTION') return 'distribution'
    if (type === 'CAPITAL_RETURN') return 'capital_return'
    return 'other'
}

function normalizeFeeKind(type, movement) {
    const explicit = text(movement.feeType || movement.category || movement.feeCategory)
    if (explicit) return explicit.toLowerCase()
    if (type === 'BUY') return 'buy_fee'
    if (type === 'SELL') return 'sell_fee'
    if (type === 'BROKERAGE_FEE') return 'brokerage'
    if (type === 'BUY_FEE') return 'buy_fee'
    if (type === 'SELL_FEE') return 'sell_fee'
    if (type === 'CUSTODY_FEE') return 'custody'
    if (type === 'MANAGEMENT_FEE') return 'management'
    if (type === 'MISC_FEE') return 'misc'
    return 'other'
}

function movementAmount(movement) {
    const cashAmount = maybeNumber(movement.cashAmount ?? movement.amount ?? movement.grossAmount ?? movement.netAmount)
    if (cashAmount != null) return Math.abs(cashAmount)

    const quantity = maybeNumber(movement.quantity)
    const unitPrice = maybeNumber(movement.unitPrice)
    if (quantity != null && unitPrice != null) return Math.abs(quantity * unitPrice)

    return 0
}

function feeAmount(movement) {
    const explicitFee = maybeNumber(movement.feeAmount ?? movement.amount ?? movement.cashAmount)
    return explicitFee == null ? 0 : Math.abs(explicitFee)
}

function assetId(movement) {
    return maybeNumber(movement.assetId ?? movement.instrumentId ?? movement.investmentInstrumentId ?? movement.position?.instrumentId)
}

function assetLabel(movement) {
    return text(
        movement.assetName ||
        movement.instrumentName ||
        movement.instrument?.name ||
        movement.asset?.name ||
        movement.symbol ||
        movement.instrument?.symbol ||
        movement.asset?.symbol,
    ) || (assetId(movement) != null ? `Actif ${assetId(movement)}` : 'Non affecté')
}

function accountId(movement) {
    return maybeNumber(movement.accountId ?? movement.account?.id)
}

function accountLabel(movement) {
    return text(movement.accountName || movement.account?.name) || (accountId(movement) != null ? `Compte ${accountId(movement)}` : 'Compte inconnu')
}

async function convertEventAmount(event, options = {}) {
    const baseCurrency = currency(options.baseCurrency || options.currency, 'CAD')
    try {
        const fxRate = await convertAmountWithFx(
            {
                amount: event.originalAmount,
                from: event.originalCurrency,
                to: baseCurrency,
                date: event.date,
            },
            {
                rates: options.fxRates,
                resolver: options.fxRateResolver,
            },
        )
        return {
            ...event,
            currency: baseCurrency,
            amount: roundMoney(fxRate.convertedAmount),
            converted: true,
            fxRate,
            conversionError: null,
        }
    } catch (error) {
        return {
            ...event,
            currency: baseCurrency,
            amount: null,
            converted: false,
            fxRate: null,
            conversionError: {
                code: error.code || 'FX_RATE_UNAVAILABLE',
                message: error.message || 'Conversion FX indisponible.',
            },
        }
    }
}

function createIncomeEvent(movement) {
    const type = movementType(movement)
    return {
        id: movement.id || `income-${movementDate(movement)}-${assetId(movement) || 'none'}`,
        kind: 'income',
        type: normalizeIncomeKind(type),
        movementType: type,
        date: isoDate(movementDate(movement)),
        accountId: accountId(movement),
        accountLabel: accountLabel(movement),
        assetId: assetId(movement),
        assetLabel: assetLabel(movement),
        originalAmount: roundMoney(movementAmount(movement)),
        originalCurrency: currency(movement.cashCurrency ?? movement.currency ?? movement.priceCurrency, 'CAD'),
        note: movement.note || null,
    }
}

function createFeeEvent(movement, explicitType = null) {
    const type = movementType(movement)
    const feeType = explicitType || type
    return {
        id: movement.id ? `${movement.id}:${normalizeFeeKind(feeType, movement)}` : `fee-${movementDate(movement)}-${assetId(movement) || 'none'}`,
        kind: 'fee',
        type: normalizeFeeKind(feeType, movement),
        movementType: type,
        date: isoDate(movementDate(movement)),
        accountId: accountId(movement),
        accountLabel: accountLabel(movement),
        assetId: assetId(movement),
        assetLabel: assetLabel(movement),
        originalAmount: roundMoney(feeAmount(movement)),
        originalCurrency: currency(movement.feeCurrency ?? movement.cashCurrency ?? movement.currency ?? movement.priceCurrency, 'CAD'),
        note: movement.note || null,
    }
}

function normalizeMovementEvents(movement) {
    const type = movementType(movement)
    const events = []

    if (INCOME_TYPES.has(type)) events.push(createIncomeEvent(movement))

    if (TRADE_TYPES.has(type) && feeAmount({...movement, amount: movement.feeAmount}) > 0) {
        events.push(createFeeEvent({...movement, amount: movement.feeAmount, cashAmount: null}, type))
    }

    if (FEE_TYPES.has(type)) events.push(createFeeEvent(movement, type))

    return events.filter((event) => event.originalAmount > 0)
}

async function normalizePortfolioIncomeEvents(movements = [], options = {}) {
    const period = resolvePeriod(options)
    const events = []

    for (const movement of Array.isArray(movements) ? movements : []) {
        if (!isInPeriod(movement, period)) continue
        const movementEvents = normalizeMovementEvents(movement)
        for (const event of movementEvents) {
            events.push(await convertEventAmount(event, options))
        }
    }

    return {period: serializePeriod(period), events}
}

function serializePeriod(period) {
    return {
        period: period.period,
        startDate: period.startDate.toISOString().slice(0, 10),
        endDateExclusive: period.endDate.toISOString().slice(0, 10),
    }
}

function createEmptyGroup(key, label) {
    return {
        key: String(key ?? 'unknown'),
        label,
        totalIncome: 0,
        totalFees: 0,
        netIncome: 0,
        incomeEventsCount: 0,
        feeEventsCount: 0,
        unconvertedIncome: [],
        unconvertedFees: [],
    }
}

function addEventToGroup(group, event) {
    if (event.kind === 'income') {
        group.incomeEventsCount += 1
        if (event.converted) group.totalIncome = roundMoney(group.totalIncome + event.amount)
        else group.unconvertedIncome.push(event)
    } else if (event.kind === 'fee') {
        group.feeEventsCount += 1
        if (event.converted) group.totalFees = roundMoney(group.totalFees + event.amount)
        else group.unconvertedFees.push(event)
    }
    group.netIncome = roundMoney(group.totalIncome - group.totalFees)
}

function groupEvents(events, keySelector, labelSelector) {
    const groups = new Map()
    for (const event of events) {
        const key = keySelector(event) ?? 'unknown'
        const label = labelSelector(event) || 'Non classé'
        const group = groups.get(String(key)) || createEmptyGroup(key, label)
        addEventToGroup(group, event)
        groups.set(String(key), group)
    }

    return [...groups.values()].sort((left, right) => right.netIncome - left.netIncome || left.label.localeCompare(right.label))
}

function summarizeUnconverted(events) {
    const groups = new Map()
    for (const event of events.filter((item) => !item.converted)) {
        const key = `${event.kind}:${event.originalCurrency}`
        const group = groups.get(key) || {
            kind: event.kind,
            currency: event.originalCurrency,
            amount: 0,
            eventsCount: 0,
        }
        group.amount = roundMoney(group.amount + event.originalAmount)
        group.eventsCount += 1
        groups.set(key, group)
    }
    return [...groups.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.currency.localeCompare(right.currency))
}

function summarizeIncome(events, options = {}) {
    const totalIncome = roundMoney(events
        .filter((event) => event.kind === 'income' && event.converted)
        .reduce((sum, event) => sum + event.amount, 0))
    const totalFees = roundMoney(events
        .filter((event) => event.kind === 'fee' && event.converted)
        .reduce((sum, event) => sum + event.amount, 0))

    return {
        currency: currency(options.baseCurrency || options.currency, 'CAD'),
        totalIncome,
        totalFees,
        netIncome: roundMoney(totalIncome - totalFees),
        incomeEventsCount: events.filter((event) => event.kind === 'income').length,
        feeEventsCount: events.filter((event) => event.kind === 'fee').length,
        convertedEventsCount: events.filter((event) => event.converted).length,
        unconvertedEventsCount: events.filter((event) => !event.converted).length,
        unconvertedByCurrency: summarizeUnconverted(events),
    }
}

async function calculatePortfolioIncome(input = {}, dependencies = {}) {
    const options = {...dependencies, ...input, baseCurrency: input.baseCurrency || input.currency || dependencies.baseCurrency || 'CAD'}
    const {period, events} = await normalizePortfolioIncomeEvents(input.movements || input.events || [], options)
    const summary = summarizeIncome(events, options)

    return {
        baseCurrency: summary.currency,
        period,
        events,
        incomeEvents: events.filter((event) => event.kind === 'income'),
        feeEvents: events.filter((event) => event.kind === 'fee'),
        summary,
        totals: summary,
        incomeByAsset: groupEvents(events, (event) => event.assetId ?? 'unknown', (event) => event.assetLabel),
        incomeByAccount: groupEvents(events, (event) => event.accountId ?? 'unknown', (event) => event.accountLabel),
    }
}

function createPortfolioIncomeService(dependencies = {}) {
    return {
        calculatePortfolioIncome: (input = {}) => calculatePortfolioIncome(input, dependencies),
        normalizePortfolioIncomeEvents: (movements = [], options = {}) => normalizePortfolioIncomeEvents(movements, {...dependencies, ...options}),
        resolvePeriod,
    }
}

module.exports = {
    calculatePortfolioIncome,
    createPortfolioIncomeService,
    normalizePortfolioIncomeEvents,
    resolvePeriod,
    summarizeIncome,
}
