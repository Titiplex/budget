const {convertAmountWithFx} = require('../marketData/fxConversion')
const {calculatePortfolioValuation, roundMoney} = require('./portfolioValuationService')

const BUY = new Set(['BUY', 'buy'])
const SELL = new Set(['SELL', 'sell'])

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const currency = (value, fallback = 'CAD') => (text(value) || fallback).toUpperCase()
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const maybeNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const date = (value, fallback = new Date()) => {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value == null || value === '' ? fallback : value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function movementType(movement) {
    return text(movement?.type)?.toUpperCase() || 'UNKNOWN'
}

function movementDate(movement) {
    return movement.operationDate ?? movement.tradeDate ?? movement.date ?? movement.createdAt
}

function movementSortKey(movement) {
    return date(movementDate(movement), new Date(0)).getTime()
}

function positionInstrumentId(position) {
    return maybeNumber(position.instrumentId ?? position.investmentInstrumentId ?? position.assetId)
}

function positionAccountId(position) {
    return maybeNumber(position.accountId ?? position.account?.id)
}

function movementBelongsToPosition(movement, position) {
    const movementPositionId = maybeNumber(movement.positionId ?? movement.investmentPositionId)
    if (movementPositionId != null && movementPositionId === maybeNumber(position.id)) return true

    const movementInstrumentId = maybeNumber(movement.instrumentId ?? movement.investmentInstrumentId ?? movement.assetId)
    const movementAccountId = maybeNumber(movement.accountId ?? movement.account?.id)
    const instrumentId = positionInstrumentId(position)
    const accountId = positionAccountId(position)

    return movementInstrumentId != null &&
        instrumentId != null &&
        movementInstrumentId === instrumentId &&
        (movementAccountId == null || accountId == null || movementAccountId === accountId)
}

function movementCashAmount(movement) {
    const cash = maybeNumber(movement.cashAmount)
    if (cash != null) return Math.abs(cash)

    const quantity = maybeNumber(movement.quantity)
    const unitPrice = maybeNumber(movement.unitPrice)
    return quantity != null && unitPrice != null ? Math.abs(quantity * unitPrice) : 0
}

async function safeConvertAmount(amount, from, to, at, options = {}) {
    try {
        const fxRate = await convertAmountWithFx(
            {amount: numberOr(amount), from: currency(from, to), to: currency(to, from), date: at},
            {rates: options.fxRates, resolver: options.fxRateResolver},
        )
        return {amount: fxRate.convertedAmount, fxRate, error: null}
    } catch (error) {
        return {amount: null, fxRate: null, error}
    }
}

async function convertMovementCash(movement, baseCurrency, options = {}) {
    const cashCurrency = currency(movement.cashCurrency ?? movement.priceCurrency, baseCurrency)
    return safeConvertAmount(movementCashAmount(movement), cashCurrency, baseCurrency, movementDate(movement), options)
}

async function convertMovementFee(movement, baseCurrency, options = {}) {
    const feeCurrency = currency(movement.feeCurrency ?? movement.cashCurrency ?? movement.priceCurrency, baseCurrency)
    return safeConvertAmount(Math.abs(numberOr(movement.feeAmount)), feeCurrency, baseCurrency, movementDate(movement), options)
}

/**
 * Weighted-average-cost ledger for the MVP.
 *
 * BUY increases quantity and cost basis. Buy fees are included in cost by default.
 * SELL removes cost basis at the average cost currently carried by the position,
 * then realizes proceeds minus sale fees minus removed basis.
 */
async function calculateWeightedAveragePositionMetrics(position, movements = [], options = {}) {
    const baseCurrency = currency(options.baseCurrency)
    const asOf = date(options.asOf)
    const includeBuyFees = options.includeBuyFeesInCost !== false
    const relatedMovements = movements
        .filter((movement) => movementBelongsToPosition(movement, position))
        .filter((movement) => movementSortKey(movement) <= asOf.getTime())
        .sort((left, right) => movementSortKey(left) - movementSortKey(right) || numberOr(left.id) - numberOr(right.id))

    let quantity = 0
    let remainingCost = 0
    let realizedGain = 0
    let realizedCostBasis = 0
    let realizedProceeds = 0
    const warnings = []

    for (const movement of relatedMovements) {
        const type = movementType(movement)
        const quantityDelta = Math.abs(numberOr(movement.quantity))
        const cash = await convertMovementCash(movement, baseCurrency, options)
        const fee = await convertMovementFee(movement, baseCurrency, options)

        if (cash.error) warnings.push(`Conversion FX indisponible pour le mouvement ${movement.id || 'sans id'}.`)
        if (fee.error) warnings.push(`Conversion FX des frais indisponible pour le mouvement ${movement.id || 'sans id'}.`)

        const convertedCash = cash.amount ?? 0
        const convertedFee = fee.amount ?? 0

        if (BUY.has(type)) {
            quantity += quantityDelta
            remainingCost += convertedCash + (includeBuyFees ? convertedFee : 0)
        } else if (SELL.has(type)) {
            const soldQuantity = Math.min(quantity, quantityDelta)
            const averageCost = quantity > 0 ? remainingCost / quantity : 0
            const removedCostBasis = averageCost * soldQuantity
            const netProceeds = convertedCash - convertedFee

            quantity = Math.max(0, quantity - soldQuantity)
            remainingCost = quantity === 0 ? 0 : Math.max(0, remainingCost - removedCostBasis)
            realizedCostBasis += removedCostBasis
            realizedProceeds += netProceeds
            realizedGain += netProceeds - removedCostBasis
        }
    }

    if (!relatedMovements.length) {
        const fallbackQuantity = numberOr(position.quantity)
        const fallbackCost = maybeNumber(position.costBasis ?? position.bookValue)
        return {
            method: 'weighted_average',
            quantity: roundMoney(fallbackQuantity, 8),
            remainingCost: roundMoney(fallbackCost ?? 0),
            averageCost: fallbackQuantity > 0 && fallbackCost != null ? roundMoney(fallbackCost / fallbackQuantity, 6) : null,
            realizedGain: 0,
            realizedGainPercent: null,
            realizedCostBasis: 0,
            realizedProceeds: 0,
            totalCostBasis: roundMoney(fallbackCost ?? 0),
            closed: fallbackQuantity === 0,
            movements: relatedMovements,
            warnings,
        }
    }

    const realizedGainPercent = realizedCostBasis > 0 ? roundMoney((realizedGain / realizedCostBasis) * 100, 4) : null

    return {
        method: 'weighted_average',
        quantity: roundMoney(quantity, 8),
        remainingCost: roundMoney(remainingCost),
        averageCost: quantity > 0 ? roundMoney(remainingCost / quantity, 6) : null,
        realizedGain: roundMoney(realizedGain),
        realizedGainPercent,
        realizedCostBasis: roundMoney(realizedCostBasis),
        realizedProceeds: roundMoney(realizedProceeds),
        totalCostBasis: roundMoney(remainingCost + realizedCostBasis),
        closed: quantity === 0,
        movements: relatedMovements,
        warnings,
    }
}

function createGainLoss(amount, percent, currencyCode, realized = false) {
    return {
        absolute: roundMoney(amount),
        percent: percent == null ? null : roundMoney(percent, 4),
        currency: currencyCode,
        realized,
    }
}

function calculateUnrealizedGain(positionValuation, costMetrics, baseCurrency) {
    if (costMetrics.quantity === 0) return createGainLoss(0, null, baseCurrency, false)
    if (positionValuation.marketValue == null) return null

    const absolute = roundMoney(positionValuation.marketValue - costMetrics.remainingCost)
    const percent = costMetrics.remainingCost > 0 ? (absolute / costMetrics.remainingCost) * 100 : null
    return createGainLoss(absolute, percent, baseCurrency, false)
}

function enrichPositionWithGainMetrics(positionValuation, costMetrics, baseCurrency) {
    const unrealized = calculateUnrealizedGain(positionValuation, costMetrics, baseCurrency)
    const realized = createGainLoss(costMetrics.realizedGain, costMetrics.realizedGainPercent, baseCurrency, true)
    const totalAmount = roundMoney((unrealized?.absolute ?? 0) + realized.absolute)
    const totalDenominator = costMetrics.totalCostBasis
    const totalPercent = totalDenominator > 0 ? (totalAmount / totalDenominator) * 100 : null

    return {
        ...positionValuation,
        quantity: costMetrics.quantity,
        quantityHeld: costMetrics.quantity,
        averageCost: costMetrics.averageCost,
        bookValue: costMetrics.remainingCost,
        investedCost: costMetrics.remainingCost,
        unrealizedGainLoss: unrealized,
        unrealizedGain: unrealized?.absolute ?? null,
        unrealizedGainPercent: unrealized?.percent ?? null,
        realizedGainLoss: realized,
        realizedGainSimple: realized.absolute,
        realizedGainPercent: realized.percent,
        totalGainLoss: createGainLoss(totalAmount, totalPercent, baseCurrency, false),
        gainLossTotal: totalAmount,
        costMethod: costMetrics.method,
        realizedCostBasis: costMetrics.realizedCostBasis,
        realizedProceeds: costMetrics.realizedProceeds,
        totalCostBasis: costMetrics.totalCostBasis,
        isClosed: costMetrics.closed,
        warnings: [...(positionValuation.warnings || []), ...costMetrics.warnings],
    }
}

function summarizeGainMetrics(positions, baseCurrency) {
    const totalUnrealizedGain = roundMoney(
        positions.reduce((sum, position) => sum + (position.unrealizedGainLoss?.absolute ?? 0), 0),
    )
    const unrealizedCostBasis = roundMoney(
        positions.reduce((sum, position) => position.unrealizedGainLoss == null ? sum : sum + position.investedCost, 0),
    )
    const realizedGainSimple = roundMoney(
        positions.reduce((sum, position) => sum + (position.realizedGainLoss?.absolute ?? 0), 0),
    )
    const realizedCostBasis = roundMoney(
        positions.reduce((sum, position) => sum + (position.realizedCostBasis || 0), 0),
    )
    const totalGainLoss = roundMoney(totalUnrealizedGain + realizedGainSimple)
    const totalCostBasis = roundMoney(unrealizedCostBasis + realizedCostBasis)
    const grossReturnSimple = totalCostBasis > 0 ? roundMoney((totalGainLoss / totalCostBasis) * 100, 4) : null

    return {
        currency: baseCurrency,
        totalUnrealizedGain,
        totalUnrealizedGainPercent: unrealizedCostBasis > 0
            ? roundMoney((totalUnrealizedGain / unrealizedCostBasis) * 100, 4)
            : null,
        realizedGainSimple,
        realizedGainPercent: realizedCostBasis > 0
            ? roundMoney((realizedGainSimple / realizedCostBasis) * 100, 4)
            : null,
        totalGainLoss,
        grossReturnSimple,
        grossReturnSimplePercent: grossReturnSimple,
        unrealizedCostBasis,
        realizedCostBasis,
        totalCostBasis,
        valuedPositionsCount: positions.filter((position) => position.unrealizedGainLoss != null).length,
        incompletePositionsCount: positions.filter((position) => position.unrealizedGainLoss == null).length,
    }
}

function applyAllocationPercentages(positions, totalMarketValue) {
    return positions.map((position) => ({
        ...position,
        allocationPercent: totalMarketValue > 0 && position.marketValue != null
            ? roundMoney((position.marketValue / totalMarketValue) * 100, 4)
            : 0,
    }))
}

async function calculatePortfolioMetrics(input = {}, dependencies = {}) {
    const baseCurrency = currency(input.baseCurrency ?? input.currency ?? dependencies.baseCurrency, 'CAD')
    const asOf = date(input.asOf ?? dependencies.asOf ?? dependencies.now?.() ?? new Date())
    const options = {
        ...dependencies,
        ...input,
        baseCurrency,
        asOf,
        fxRates: input.fxRates ?? dependencies.fxRates,
        fxRateResolver: input.fxRateResolver ?? dependencies.fxRateResolver,
    }
    const valuation = input.valuation || await calculatePortfolioValuation({...input, baseCurrency, asOf}, dependencies)
    const sourcePositions = Array.isArray(input.positions) ? input.positions : []
    const movements = Array.isArray(input.movements) ? input.movements : []
    const enriched = []

    for (const positionValuation of valuation.positions || []) {
        const sourcePosition = sourcePositions.find((position) => maybeNumber(position.id) === maybeNumber(positionValuation.id)) || positionValuation
        const costMetrics = await calculateWeightedAveragePositionMetrics(sourcePosition, movements, options)
        enriched.push(enrichPositionWithGainMetrics(positionValuation, costMetrics, baseCurrency))
    }

    const totalMarketValue = roundMoney(enriched.reduce((sum, position) => sum + (position.marketValue ?? 0), 0))
    const positions = applyAllocationPercentages(enriched, totalMarketValue)
    const gainMetrics = summarizeGainMetrics(positions, baseCurrency)

    return {
        ...valuation,
        baseCurrency,
        asOf: asOf.toISOString(),
        positions,
        totals: {
            ...(valuation.totals || {}),
            totalMarketValue,
            totalInvestedCost: roundMoney(positions.reduce((sum, position) => sum + position.investedCost, 0)),
            totalUnrealizedGain: gainMetrics.totalUnrealizedGain,
            totalUnrealizedGainPercent: gainMetrics.totalUnrealizedGainPercent,
            realizedGainSimple: gainMetrics.realizedGainSimple,
            realizedGainPercent: gainMetrics.realizedGainPercent,
            totalGainLoss: gainMetrics.totalGainLoss,
            grossReturnSimple: gainMetrics.grossReturnSimple,
            grossReturnSimplePercent: gainMetrics.grossReturnSimplePercent,
        },
        gainMetrics,
        warnings: [
            ...(valuation.warnings || []),
            ...positions.flatMap((position) => (position.warnings || []).map((warning) => ({positionId: position.id, warning}))),
        ],
    }
}

function createPortfolioMetricsService(dependencies = {}) {
    return {
        calculatePortfolioMetrics: (input = {}) => calculatePortfolioMetrics(input, dependencies),
        calculateWeightedAveragePositionMetrics: (position, movements = [], options = {}) =>
            calculateWeightedAveragePositionMetrics(position, movements, {...dependencies, ...options}),
    }
}

module.exports = {
    calculatePortfolioMetrics,
    calculateWeightedAveragePositionMetrics,
    createPortfolioMetricsService,
    summarizeGainMetrics,
}
