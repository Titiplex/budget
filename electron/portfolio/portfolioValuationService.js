const {convertAmountWithFx} = require('../marketData/fxConversion')

const AUTO_STATUSES = new Set(['market', 'stale'])
const BUY = new Set(['BUY', 'buy'])
const SELL = new Set(['SELL', 'sell'])
const CASH_IN = new Set(['DEPOSIT', 'deposit'])
const CASH_OUT = new Set(['WITHDRAWAL', 'withdrawal'])
const FEE = new Set(['FEE', 'fee'])

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const currency = (value, fallback = 'CAD') => (text(value) || fallback).toUpperCase()
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const maybeNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const date = (value, fallback = new Date()) => {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value == null || value === '' ? fallback : value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}
const iso = (value, fallback = new Date()) => date(value, fallback).toISOString()

function roundMoney(value, precision = 2) {
    if (!Number.isFinite(Number(value))) return 0
    const factor = 10 ** Math.max(0, Math.min(8, Number.isInteger(precision) ? precision : 2))
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function movementType(movement) {
    return text(movement?.type)?.toUpperCase() || 'UNKNOWN'
}

function positionInstrumentId(position) {
    return maybeNumber(position.instrumentId ?? position.investmentInstrumentId ?? position.assetId)
}

function positionAccountId(position) {
    return maybeNumber(position.accountId ?? position.account?.id)
}

function positionMarketInstrumentId(position) {
    return maybeNumber(
        position.marketInstrumentId ??
        position.instrument?.marketInstrumentId ??
        position.instrument?.marketInstrument?.id ??
        position.marketInstrument?.id,
    )
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

function movementDate(movement) {
    return movement.operationDate ?? movement.tradeDate ?? movement.date ?? movement.createdAt
}

function movementSortKey(movement) {
    return date(movementDate(movement), new Date(0)).getTime()
}

function snapshotSortKey(snapshot) {
    return date(snapshot.pricedAt ?? snapshot.valueAsOf ?? snapshot.retrievedAt ?? snapshot.createdAt, new Date(0)).getTime()
}

function snapshotBelongsToPosition(snapshot, position) {
    const snapshotPositionId = maybeNumber(snapshot.positionId ?? snapshot.investmentPositionId ?? snapshot.holdingLotId)
    if (snapshotPositionId != null && snapshotPositionId === maybeNumber(position.id)) return true

    const snapshotMarketInstrumentId = maybeNumber(snapshot.marketInstrumentId ?? snapshot.instrumentId)
    const marketInstrumentId = positionMarketInstrumentId(position)
    return snapshotMarketInstrumentId != null && marketInstrumentId != null && snapshotMarketInstrumentId === marketInstrumentId
}

function getLatestPriceSnapshot(position, priceSnapshots = [], asOf = new Date()) {
    const cutoff = date(asOf).getTime()
    return priceSnapshots
        .filter((snapshot) => snapshotBelongsToPosition(snapshot, position))
        .filter((snapshot) => snapshotSortKey(snapshot) <= cutoff)
        .sort((left, right) => snapshotSortKey(right) - snapshotSortKey(left) || numberOr(right.id) - numberOr(left.id))[0] || null
}

async function safeConvertAmount(amount, from, to, at, options = {}) {
    try {
        const fxRate = await convertAmountWithFx(
            {amount: numberOr(amount), from: currency(from, to), to: currency(to, from), date: at},
            {rates: options.fxRates, resolver: options.fxRateResolver},
        )
        return {amount: fxRate.convertedAmount, fxRate}
    } catch (error) {
        return {amount: null, fxRate: null, error}
    }
}

function movementCashAmount(movement) {
    const cash = maybeNumber(movement.cashAmount)
    if (cash != null) return cash
    const quantity = maybeNumber(movement.quantity)
    const unitPrice = maybeNumber(movement.unitPrice)
    return quantity != null && unitPrice != null ? Math.abs(quantity * unitPrice) : 0
}

async function calculatePositionCost(position, movements = [], options = {}) {
    const baseCurrency = currency(options.baseCurrency)
    const asOf = date(options.asOf)
    const includeFees = options.includeFeesInCost !== false
    const relatedMovements = movements
        .filter((movement) => movementBelongsToPosition(movement, position))
        .filter((movement) => movementSortKey(movement) <= asOf.getTime())
        .sort((left, right) => movementSortKey(left) - movementSortKey(right) || numberOr(left.id) - numberOr(right.id))

    let quantity = 0
    let investedCost = 0
    let netInvestedCash = 0
    let error = null

    for (const movement of relatedMovements) {
        const type = movementType(movement)
        const at = movementDate(movement) ?? asOf
        const cashCurrency = currency(movement.cashCurrency ?? movement.priceCurrency ?? position.costCurrency ?? position.currency, baseCurrency)
        const feeCurrency = currency(movement.feeCurrency ?? cashCurrency, cashCurrency)
        const cash = await safeConvertAmount(Math.abs(movementCashAmount(movement)), cashCurrency, baseCurrency, at, options)
        const fee = await safeConvertAmount(Math.abs(numberOr(movement.feeAmount)), feeCurrency, baseCurrency, at, options)
        if (cash.error && !error) error = cash.error
        if (fee.error && !error) error = fee.error

        const convertedCash = cash.amount ?? 0
        const convertedFee = fee.amount ?? 0
        const quantityDelta = Math.abs(numberOr(movement.quantity))

        if (BUY.has(type)) {
            quantity += quantityDelta
            investedCost += convertedCash + (includeFees ? convertedFee : 0)
            netInvestedCash += convertedCash + convertedFee
        } else if (SELL.has(type)) {
            const soldQuantity = Math.min(quantity, quantityDelta)
            const averageCost = quantity > 0 ? investedCost / quantity : 0
            investedCost = Math.max(0, investedCost - averageCost * soldQuantity)
            quantity = Math.max(0, quantity - soldQuantity)
            netInvestedCash += convertedFee - convertedCash
        } else if (CASH_IN.has(type)) netInvestedCash += convertedCash
        else if (CASH_OUT.has(type)) netInvestedCash -= convertedCash
        else if (FEE.has(type)) netInvestedCash += convertedCash || convertedFee
    }

    const finalQuantity = relatedMovements.length ? quantity : numberOr(position.quantity)
    const fallbackCost = maybeNumber(position.costBasis ?? position.bookValue)
    let finalInvestedCost = relatedMovements.length || fallbackCost == null ? investedCost : fallbackCost

    if (!relatedMovements.length && fallbackCost != null) {
        const conversion = await safeConvertAmount(
            fallbackCost,
            currency(position.costCurrency ?? position.currency, baseCurrency),
            baseCurrency,
            position.valueAsOf ?? asOf,
            options,
        )
        if (conversion.error && !error) error = conversion.error
        if (conversion.amount != null) finalInvestedCost = conversion.amount
    }

    return {
        movements: relatedMovements,
        quantity: roundMoney(finalQuantity, 8),
        investedCost: roundMoney(finalInvestedCost),
        averageCost: finalQuantity > 0 ? roundMoney(finalInvestedCost / finalQuantity, 6) : null,
        netInvestedCash: roundMoney(relatedMovements.length ? netInvestedCash : finalInvestedCost),
        error,
    }
}

function normalizeFreshnessStatus(snapshot) {
    return text(snapshot?.freshnessStatus ?? snapshot?.stalenessStatus)?.toUpperCase() || 'UNKNOWN'
}

function statusFromSnapshot(snapshot) {
    const freshnessStatus = normalizeFreshnessStatus(snapshot)
    if (freshnessStatus === 'ERROR') return 'error'
    if (freshnessStatus === 'STALE') return 'stale'
    return 'market'
}

function manualValuation(position, quantity) {
    const marketValue = maybeNumber(position.manualMarketValue ?? position.marketValue ?? position.currentValue)
    if (marketValue != null && marketValue >= 0) {
        return {
            marketValue,
            unitPrice: maybeNumber(position.manualUnitPrice ?? position.unitPrice),
            currency: currency(position.manualCurrency ?? position.currency ?? position.costCurrency),
            valueAsOf: position.manualValueAsOf ?? position.valueAsOf ?? null,
        }
    }

    const unitPrice = maybeNumber(position.manualUnitPrice ?? position.unitPrice)
    if (unitPrice != null && unitPrice > 0) {
        return {
            marketValue: unitPrice * numberOr(quantity ?? position.quantity),
            unitPrice,
            currency: currency(position.manualCurrency ?? position.currency ?? position.costCurrency),
            valueAsOf: position.manualValueAsOf ?? position.valueAsOf ?? null,
        }
    }

    return null
}

function assetClass(value) {
    return {
        CASH: 'cash',
        EQUITY: 'equity',
        ETF: 'etf',
        FUND: 'fund',
        MUTUAL_FUND: 'fund',
        BOND: 'bond',
        CRYPTO: 'crypto',
        REAL_ESTATE: 'real_estate',
        REAL_ESTATE_FUND: 'real_estate',
        COMMODITY: 'commodity',
        FOREX: 'forex',
        OTHER: 'other',
    }[text(value)?.toUpperCase()] || 'other'
}

function buildAsset(position) {
    const instrument = position.instrument || position.asset || null
    const symbol = position.symbol ?? instrument?.symbol ?? null
    return {
        id: positionInstrumentId(position) ?? maybeNumber(position.id) ?? 0,
        symbol,
        name: position.name ?? instrument?.name ?? symbol ?? `Position ${position.id}`,
        assetClass: assetClass(instrument?.assetClass ?? position.assetClass),
        sector: text(instrument?.sector ?? position.sector),
        geography: text(instrument?.geographicRegion ?? position.geography),
        currency: currency(instrument?.currency ?? position.currency ?? position.costCurrency),
        marketInstrumentId: positionMarketInstrumentId(position),
        isActive: position.status ? text(position.status)?.toUpperCase() === 'ACTIVE' : true,
        note: position.note || instrument?.note || null,
    }
}

async function calculatePositionValuation(position, movements = [], priceSnapshots = [], options = {}) {
    const baseCurrency = currency(options.baseCurrency)
    const asOf = date(options.asOf)
    const cost = await calculatePositionCost(position, movements, {...options, baseCurrency, asOf})
    const warnings = []
    if (cost.error) warnings.push('Le coût investi natif existe, mais une conversion FX de mouvement est indisponible.')

    let valuationStatus = 'missing'
    let valuationSource = 'missing'
    let unitPrice = null
    let marketValue = null
    let nativeMarketValue = null
    let valueAsOf = null
    let freshnessStatus = 'MISSING'
    let usedSnapshot = null
    let fxRate = null
    let error = null

    const snapshot = getLatestPriceSnapshot(position, priceSnapshots, asOf)
    const snapshotUnitPrice = maybeNumber(snapshot?.unitPrice)

    if (snapshot && snapshotUnitPrice != null && snapshotUnitPrice > 0) {
        const quoteCurrency = currency(snapshot.currency ?? position.currency ?? position.costCurrency, baseCurrency)
        nativeMarketValue = snapshotUnitPrice * cost.quantity
        const conversion = await safeConvertAmount(nativeMarketValue, quoteCurrency, baseCurrency, snapshot.pricedAt ?? snapshot.valueAsOf ?? asOf, options)
        if (conversion.error) {
            valuationStatus = 'error'
            valuationSource = 'market'
            error = conversion.error
            warnings.push('La valeur de marché native existe, mais la conversion FX est indisponible.')
        } else {
            marketValue = roundMoney(conversion.amount)
            valuationStatus = statusFromSnapshot(snapshot)
            valuationSource = 'market'
            fxRate = conversion.fxRate
        }
        unitPrice = snapshotUnitPrice
        valueAsOf = snapshot.pricedAt ?? snapshot.valueAsOf ?? null
        freshnessStatus = normalizeFreshnessStatus(snapshot)
        usedSnapshot = snapshot
    } else {
        const manual = manualValuation(position, cost.quantity)
        if (manual) {
            nativeMarketValue = manual.marketValue
            const conversion = await safeConvertAmount(manual.marketValue, manual.currency, baseCurrency, manual.valueAsOf || asOf, options)
            if (conversion.error) {
                valuationStatus = 'error'
                valuationSource = 'manual'
                error = conversion.error
                warnings.push('La valeur manuelle existe, mais la conversion FX est indisponible.')
            } else {
                marketValue = roundMoney(conversion.amount)
                valuationStatus = 'manual'
                valuationSource = 'manual'
                fxRate = conversion.fxRate
                warnings.push('Valorisation basée sur le fallback manuel.')
            }
            unitPrice = manual.unitPrice ?? (cost.quantity > 0 ? manual.marketValue / cost.quantity : null)
            valueAsOf = manual.valueAsOf
            freshnessStatus = 'UNKNOWN'
        } else warnings.push('Aucun prix de marché ni fallback manuel disponible.')
    }

    const gainAbsolute = marketValue == null ? null : roundMoney(marketValue - cost.investedCost)
    const gainPercent = gainAbsolute == null || cost.investedCost === 0 ? null : roundMoney((gainAbsolute / cost.investedCost) * 100, 4)

    return {
        id: maybeNumber(position.id) ?? 0,
        accountId: positionAccountId(position) ?? 0,
        accountName: position.accountName ?? position.account?.name ?? 'Investment account',
        assetId: positionInstrumentId(position) ?? maybeNumber(position.id) ?? 0,
        asset: buildAsset(position),
        quantity: cost.quantity,
        quantityHeld: cost.quantity,
        averageCost: cost.averageCost,
        bookValue: cost.investedCost,
        investedCost: cost.investedCost,
        marketValue,
        unavailableValue: marketValue == null ? cost.investedCost : 0,
        currency: baseCurrency,
        valuationCurrency: baseCurrency,
        nativeMarketValue: nativeMarketValue == null ? null : roundMoney(nativeMarketValue),
        unitPrice,
        valuationSource,
        source: valuationSource,
        valuationStatus,
        freshnessStatus,
        valuedAt: valueAsOf ? iso(valueAsOf, asOf) : null,
        valueAsOf: valueAsOf ? iso(valueAsOf, asOf) : null,
        allocationPercent: 0,
        unrealizedGainLoss: gainAbsolute == null ? null : {absolute: gainAbsolute, percent: gainPercent, currency: baseCurrency, realized: false},
        usedSnapshot,
        fxRate,
        error,
        warnings,
        movementCount: cost.movements.length,
        netInvestedCash: cost.netInvestedCash,
    }
}

async function calculateNetInvestedCash(movements = [], options = {}) {
    const baseCurrency = currency(options.baseCurrency)
    const asOf = date(options.asOf)
    const eligibleMovements = movements.filter((movement) => movementSortKey(movement) <= asOf.getTime())
    const hasExternalCashFlows = eligibleMovements.some((movement) => CASH_IN.has(movementType(movement)) || CASH_OUT.has(movementType(movement)))
    let total = 0
    let error = null

    for (const movement of eligibleMovements) {
        const type = movementType(movement)
        const at = movementDate(movement) ?? asOf
        const cash = await safeConvertAmount(Math.abs(movementCashAmount(movement)), currency(movement.cashCurrency ?? movement.priceCurrency, baseCurrency), baseCurrency, at, options)
        const fee = await safeConvertAmount(Math.abs(numberOr(movement.feeAmount)), currency(movement.feeCurrency ?? movement.cashCurrency ?? movement.priceCurrency, baseCurrency), baseCurrency, at, options)
        if (cash.error && !error) error = cash.error
        if (fee.error && !error) error = fee.error
        const convertedCash = cash.amount ?? 0
        const convertedFee = fee.amount ?? 0

        if (hasExternalCashFlows) {
            if (CASH_IN.has(type)) total += convertedCash
            else if (CASH_OUT.has(type)) total -= convertedCash
            else if (FEE.has(type)) total += convertedCash || convertedFee
        } else if (BUY.has(type)) total += convertedCash + convertedFee
        else if (SELL.has(type)) total += convertedFee - convertedCash
        else if (FEE.has(type)) total += convertedCash || convertedFee
    }

    return {netInvestedCash: roundMoney(total), error}
}

function summarizePortfolio(positions, baseCurrency, netInvestedCashOverride = null) {
    const totalMarketValue = roundMoney(positions.reduce((sum, position) => sum + (position.marketValue ?? 0), 0))
    const totalInvestedCost = roundMoney(positions.reduce((sum, position) => sum + position.investedCost, 0))
    const netInvestedCash = netInvestedCashOverride == null
        ? roundMoney(positions.reduce((sum, position) => sum + position.netInvestedCash, 0))
        : roundMoney(netInvestedCashOverride)
    const unavailableValue = roundMoney(positions.reduce((sum, position) => sum + position.unavailableValue, 0))
    const automaticallyValuedValue = roundMoney(positions.filter((position) => AUTO_STATUSES.has(position.valuationStatus)).reduce((sum, position) => sum + (position.marketValue ?? 0), 0))
    const manuallyValuedValue = roundMoney(positions.filter((position) => position.valuationStatus === 'manual').reduce((sum, position) => sum + (position.marketValue ?? 0), 0))

    return {
        baseCurrency,
        totalMarketValue,
        totalInvestedCost,
        netInvestedCash,
        unavailableValue,
        automaticallyValuedValue,
        manuallyValuedValue,
        automaticallyValuedPercent: totalMarketValue > 0 ? roundMoney((automaticallyValuedValue / totalMarketValue) * 100, 4) : 0,
        manuallyValuedPercent: totalMarketValue > 0 ? roundMoney((manuallyValuedValue / totalMarketValue) * 100, 4) : 0,
        positionsCount: positions.length,
        unavailablePositionsCount: positions.filter((position) => position.marketValue == null).length,
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

async function calculatePortfolioValuation(input = {}, dependencies = {}) {
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
    const sourcePositions = Array.isArray(input.positions) ? input.positions : []
    const movements = Array.isArray(input.movements) ? input.movements : []
    const priceSnapshots = Array.isArray(input.priceSnapshots) ? input.priceSnapshots : []
    const positionResults = []

    for (const position of sourcePositions) {
        positionResults.push(await calculatePositionValuation(position, movements, priceSnapshots, options))
    }

    const cashFlowSummary = await calculateNetInvestedCash(movements, options)
    const totalsWithoutAllocations = summarizePortfolio(positionResults, baseCurrency, cashFlowSummary.netInvestedCash)
    const positions = applyAllocationPercentages(positionResults, totalsWithoutAllocations.totalMarketValue)
    const totals = summarizePortfolio(positions, baseCurrency, cashFlowSummary.netInvestedCash)
    const warnings = positions.flatMap((position) => position.warnings.map((warning) => ({positionId: position.id, warning})))
    if (cashFlowSummary.error) warnings.push({positionId: null, warning: 'Le cash investi net contient des mouvements dont la conversion FX est indisponible.'})

    return {baseCurrency, asOf: asOf.toISOString(), positions, totals, warnings}
}

function createPortfolioValuationService(dependencies = {}) {
    return {
        calculatePortfolioValuation: (input = {}) => calculatePortfolioValuation(input, dependencies),
        calculatePositionValuation: (position, input = {}) => calculatePositionValuation(position, input.movements || [], input.priceSnapshots || [], {...dependencies, ...input}),
    }
}

module.exports = {
    calculatePortfolioValuation,
    calculateNetInvestedCash,
    calculatePositionCost,
    calculatePositionValuation,
    createPortfolioValuationService,
    getLatestPriceSnapshot,
    roundMoney,
}
