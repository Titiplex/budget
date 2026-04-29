const {convertAmountWithFx} = require('./fxConversion')
const {createPriceSnapshotRepository} = require('./priceSnapshotRepository')
const {createValuationError, normalizeValuationError} = require('./valuationErrors')

const VALUATION_SOURCES = ['SNAPSHOT', 'MANUAL', 'UNAVAILABLE']

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCurrency(value, fallback = null) {
    const currency = normalizeText(value)?.toUpperCase() || normalizeText(fallback)?.toUpperCase()
    if (!currency) {
        throw createValuationError('INVALID_CURRENCY', 'La devise de valorisation est obligatoire.')
    }
    return currency
}

function normalizeId(value) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeQuantity(value, fallback = 1) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = Number(candidate)
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw createValuationError('INVALID_QUANTITY', 'La quantité doit être positive ou nulle.')
    }
    return parsed
}

function optionalPositiveNumber(value) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function optionalNonNegativeNumber(value) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeDate(value, fallback = new Date()) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = candidate instanceof Date ? new Date(candidate.getTime()) : new Date(candidate)
    if (Number.isNaN(parsed.getTime())) return fallback
    return parsed
}

function toIsoString(value, fallback = new Date()) {
    return normalizeDate(value, fallback).toISOString()
}

function roundMoney(value) {
    if (!Number.isFinite(Number(value))) return null
    return Math.round(Number(value) * 100) / 100
}

function buildUnavailableResult(request, error, warnings = []) {
    const displayCurrency = normalizeCurrency(request.displayCurrency || request.currency || request.quoteCurrency, 'CAD')
    return {
        entityType: normalizeText(request.entityType) || 'holdingLot',
        entityId: normalizeId(request.entityId),
        instrumentId: normalizeId(request.instrumentId),
        quantity: optionalNonNegativeNumber(request.quantity) ?? 0,
        currency: displayCurrency,
        quoteCurrency: normalizeText(request.quoteCurrency)?.toUpperCase() || null,
        displayCurrency,
        mode: 'UNAVAILABLE',
        source: 'UNAVAILABLE',
        unitPrice: null,
        marketValue: null,
        displayMarketValue: null,
        nativeMarketValue: null,
        valueAsOf: null,
        stalenessStatus: 'MISSING',
        freshnessStatus: 'MISSING',
        usedSnapshot: null,
        fxRate: null,
        error: normalizeValuationError(error, request),
        warnings,
    }
}

function createManualCandidate(request) {
    const quantity = normalizeQuantity(request.quantity, 1)
    const manualMarketValue = optionalNonNegativeNumber(
        request.manualMarketValue ?? request.fallbackMarketValue ?? request.currentValue ?? request.marketValue,
    )
    const manualUnitPrice = optionalPositiveNumber(
        request.manualUnitPrice ?? request.fallbackUnitPrice ?? request.unitPrice,
    )

    if (manualMarketValue != null) {
        return {
            unitPrice: quantity > 0 ? manualMarketValue / quantity : null,
            nativeMarketValue: manualMarketValue,
            currency: normalizeCurrency(request.manualCurrency || request.quoteCurrency || request.currency || request.displayCurrency, 'CAD'),
            valueAsOf: request.manualValueAsOf || request.valueAsOf || null,
        }
    }

    if (manualUnitPrice != null) {
        return {
            unitPrice: manualUnitPrice,
            nativeMarketValue: manualUnitPrice * quantity,
            currency: normalizeCurrency(request.manualCurrency || request.quoteCurrency || request.currency || request.displayCurrency, 'CAD'),
            valueAsOf: request.manualValueAsOf || request.valueAsOf || null,
        }
    }

    return null
}

function normalizeSnapshotCandidate(snapshot) {
    if (!snapshot) return null
    const unitPrice = optionalPositiveNumber(snapshot.unitPrice)
    if (unitPrice == null) return null
    return {
        unitPrice,
        currency: normalizeCurrency(snapshot.currency, 'CAD'),
        valueAsOf: snapshot.pricedAt || snapshot.valueAsOf || null,
        stalenessStatus: snapshot.stalenessStatus || snapshot.freshnessStatus || 'UNKNOWN',
        snapshot,
    }
}

async function convertNativeValue(nativeMarketValue, quoteCurrency, displayCurrency, valueAsOf, request, options = {}) {
    try {
        const fxRate = await convertAmountWithFx(
            {
                amount: nativeMarketValue,
                from: quoteCurrency,
                to: displayCurrency,
                date: valueAsOf || request.asOf || options.now || new Date(),
            },
            {
                rates: request.fxRates || options.fxRates,
                resolver: request.fxRateResolver || options.fxRateResolver,
            },
        )
        return {displayMarketValue: fxRate.convertedAmount, fxRate, error: null}
    } catch (error) {
        return {
            displayMarketValue: null,
            fxRate: null,
            error: normalizeValuationError(error, {
                ...request,
                currency: displayCurrency,
            }),
        }
    }
}

function buildValuationResult({
                                  request,
                                  source,
                                  mode,
                                  quantity,
                                  unitPrice,
                                  nativeMarketValue,
                                  quoteCurrency,
                                  displayCurrency,
                                  valueAsOf,
                                  stalenessStatus,
                                  usedSnapshot,
                                  fxResult,
                                  warnings = []
                              }) {
    const displayMarketValue = fxResult?.displayMarketValue == null ? null : roundMoney(fxResult.displayMarketValue)
    const hasFxError = Boolean(fxResult?.error)
    return {
        entityType: normalizeText(request.entityType) || 'holdingLot',
        entityId: normalizeId(request.entityId),
        instrumentId: normalizeId(request.instrumentId) || normalizeId(usedSnapshot?.instrumentId),
        quantity,
        currency: displayCurrency,
        quoteCurrency,
        displayCurrency,
        mode,
        source,
        unitPrice: unitPrice == null ? null : Number(unitPrice),
        marketValue: hasFxError ? null : displayMarketValue,
        displayMarketValue: hasFxError ? null : displayMarketValue,
        nativeMarketValue: roundMoney(nativeMarketValue),
        valueAsOf: valueAsOf ? toIsoString(valueAsOf) : null,
        stalenessStatus,
        freshnessStatus: stalenessStatus,
        usedSnapshot: usedSnapshot || null,
        fxRate: fxResult?.fxRate || null,
        error: fxResult?.error || null,
        warnings: hasFxError
            ? [...warnings, 'La valeur native existe, mais la conversion FX est indisponible.']
            : warnings,
    }
}

async function calculateMarketValuation(request = {}, dependencies = {}) {
    try {
        const quantity = normalizeQuantity(request.quantity, 1)
        const displayCurrency = normalizeCurrency(
            request.displayCurrency || request.targetCurrency || request.currency || request.quoteCurrency,
            'CAD',
        )
        const instrumentId = normalizeId(request.instrumentId)
        const lookupCurrency = normalizeText(request.quoteCurrency || request.currency)?.toUpperCase() || null
        const snapshotRepository = dependencies.snapshotRepository
        let snapshot = request.snapshot || null

        if (!snapshot && snapshotRepository && instrumentId) {
            snapshot = await snapshotRepository.getLatestUsableSnapshot(instrumentId, {
                currency: lookupCurrency,
                asOf: request.asOf,
                now: dependencies.now,
                staleAfterHours: request.staleAfterHours ?? dependencies.staleAfterHours,
            })
        }

        const snapshotCandidate = normalizeSnapshotCandidate(snapshot)
        if (snapshotCandidate) {
            const quoteCurrency = snapshotCandidate.currency
            const nativeMarketValue = snapshotCandidate.unitPrice * quantity
            const fxResult = await convertNativeValue(
                nativeMarketValue,
                quoteCurrency,
                displayCurrency,
                snapshotCandidate.valueAsOf,
                request,
                dependencies,
            )

            return buildValuationResult({
                request,
                source: 'SNAPSHOT',
                mode: 'LATEST_PRICE',
                quantity,
                unitPrice: snapshotCandidate.unitPrice,
                nativeMarketValue,
                quoteCurrency,
                displayCurrency,
                valueAsOf: snapshotCandidate.valueAsOf,
                stalenessStatus: snapshotCandidate.stalenessStatus,
                usedSnapshot: snapshotCandidate.snapshot,
                fxResult,
            })
        }

        const manualCandidate = createManualCandidate(request)
        if (manualCandidate) {
            const fxResult = await convertNativeValue(
                manualCandidate.nativeMarketValue,
                manualCandidate.currency,
                displayCurrency,
                manualCandidate.valueAsOf,
                request,
                dependencies,
            )
            return buildValuationResult({
                request,
                source: 'MANUAL',
                mode: 'FALLBACK_MANUAL',
                quantity,
                unitPrice: manualCandidate.unitPrice,
                nativeMarketValue: manualCandidate.nativeMarketValue,
                quoteCurrency: manualCandidate.currency,
                displayCurrency,
                valueAsOf: manualCandidate.valueAsOf,
                stalenessStatus: 'UNKNOWN',
                usedSnapshot: null,
                fxResult,
                warnings: ['Valorisation basée sur la valeur manuelle de fallback.'],
            })
        }

        return buildUnavailableResult(
            request,
            createValuationError('SNAPSHOT_UNAVAILABLE', 'Aucun snapshot local ni fallback manuel utilisable.', request),
        )
    } catch (error) {
        return buildUnavailableResult(request, error)
    }
}

function requestFromAsset(asset, options = {}) {
    return {
        entityType: 'asset',
        entityId: asset?.id,
        instrumentId: asset?.marketInstrumentId,
        quantity: options.quantity ?? asset?.quantity ?? 1,
        currency: options.displayCurrency || options.currency || asset?.currency,
        displayCurrency: options.displayCurrency || options.currency || asset?.currency,
        quoteCurrency: options.quoteCurrency || asset?.marketInstrument?.quoteCurrency || asset?.currency,
        currentValue: asset?.currentValue,
        manualMarketValue: options.manualMarketValue ?? asset?.currentValue,
        manualValueAsOf: options.manualValueAsOf ?? asset?.valueAsOf,
        asOf: options.asOf,
        fxRates: options.fxRates,
        fxRateResolver: options.fxRateResolver,
    }
}

function requestFromHoldingLot(holdingLot, options = {}) {
    return {
        entityType: 'holdingLot',
        entityId: holdingLot?.id,
        instrumentId: holdingLot?.marketInstrumentId,
        quantity: options.quantity ?? holdingLot?.quantity,
        currency: options.displayCurrency || options.currency || holdingLot?.portfolio?.currency || holdingLot?.currency,
        displayCurrency: options.displayCurrency || options.currency || holdingLot?.portfolio?.currency || holdingLot?.currency,
        quoteCurrency: options.quoteCurrency || holdingLot?.marketInstrument?.quoteCurrency || holdingLot?.currency,
        manualUnitPrice: options.manualUnitPrice ?? holdingLot?.unitPrice,
        manualMarketValue: options.manualMarketValue ?? holdingLot?.marketValue,
        manualValueAsOf: options.manualValueAsOf ?? holdingLot?.valueAsOf,
        asOf: options.asOf,
        fxRates: options.fxRates,
        fxRateResolver: options.fxRateResolver,
    }
}

function createMarketValuationService(options = {}) {
    const snapshotRepository =
        options.snapshotRepository ||
        (options.prisma ? createPriceSnapshotRepository(options.prisma, options.snapshotRepositoryOptions) : null)

    async function valuePosition(request) {
        return calculateMarketValuation(request, {...options, snapshotRepository})
    }

    async function valueAsset(asset, valueOptions = {}) {
        return valuePosition(requestFromAsset(asset, valueOptions))
    }

    async function valueHoldingLot(holdingLot, valueOptions = {}) {
        return valuePosition(requestFromHoldingLot(holdingLot, valueOptions))
    }

    async function valuePositions(requests = []) {
        const results = []
        for (const request of Array.isArray(requests) ? requests : []) {
            results.push(await valuePosition(request))
        }
        return results
    }

    return {
        snapshotRepository,
        valuePosition,
        valueAsset,
        valueHoldingLot,
        valuePositions,
    }
}

module.exports = {
    VALUATION_SOURCES,
    calculateMarketValuation,
    createMarketValuationService,
    requestFromAsset,
    requestFromHoldingLot,
}
