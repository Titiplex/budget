const {
    MARKET_DATA_ERROR_CODES,
    MarketDataIpcError,
} = require('./marketDataHandlers')

const MARKET_INSTRUMENT_TYPES = [
    'EQUITY',
    'ETF',
    'MUTUAL_FUND',
    'BOND',
    'CRYPTO',
    'OPTION',
    'COMMODITY',
    'FOREX',
    'INDEX',
    'FUND',
    'OTHER',
]

const FRESHNESS_STATUSES = ['UNKNOWN', 'FRESH', 'STALE', 'UNAVAILABLE', 'ERROR']
const PROVIDER_FAILURE_VALUES = new Set(['offline', 'unavailable', 'disabled', 'none'])

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeSymbol(value) {
    const normalized = normalizeText(value)?.toUpperCase()
    if (!normalized) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'Le symbole est obligatoire.',
            {fieldName: 'symbol'},
        )
    }
    return normalized
}

function normalizeCurrency(value, fallback = 'CAD') {
    return (normalizeText(value) || fallback).toUpperCase()
}

function normalizeExchange(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function normalizeProvider(value) {
    return normalizeText(value)?.toLowerCase() || 'local'
}

function normalizeInstrumentType(value) {
    const normalized = normalizeText(value)?.toUpperCase() || 'OTHER'
    return MARKET_INSTRUMENT_TYPES.includes(normalized) ? normalized : 'OTHER'
}

function requirePositiveId(value, fieldName = "L'instrument") {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            `${fieldName} est invalide.`,
            {fieldName, value},
        )
    }
    return parsed
}

function buildInstrumentKey({symbol, exchange, quoteCurrency, provider}) {
    return `${normalizeProvider(provider)}:${normalizeSymbol(symbol)}:${normalizeExchange(exchange) || 'none'}:${normalizeCurrency(quoteCurrency)}`
}

function toIso(value) {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function toSnapshotDto(snapshot, fallbackSymbol = null) {
    if (!snapshot) return null
    return {
        id: snapshot.id,
        instrumentId: snapshot.marketInstrumentId ?? snapshot.instrumentId ?? null,
        providerId: snapshot.provider || null,
        symbol: fallbackSymbol,
        unitPrice: snapshot.unitPrice,
        currency: snapshot.currency,
        pricedAt: toIso(snapshot.pricedAt),
        retrievedAt: toIso(snapshot.retrievedAt),
        source: snapshot.source === 'API' ? 'PROVIDER' : snapshot.source,
        stalenessStatus: mapFreshnessToStaleness(snapshot.freshnessStatus),
        freshnessStatus: snapshot.freshnessStatus || 'UNKNOWN',
        timeGranularity: 'DELAYED',
        note: snapshot.note || null,
        createdAt: toIso(snapshot.createdAt),
        updatedAt: toIso(snapshot.updatedAt),
    }
}

function mapFreshnessToStaleness(status) {
    switch (status) {
        case 'FRESH':
            return 'FRESH'
        case 'STALE':
            return 'STALE'
        case 'UNAVAILABLE':
            return 'MISSING'
        case 'ERROR':
            return 'UNKNOWN'
        default:
            return 'UNKNOWN'
    }
}

function computeFreshnessStatus(instrument, snapshot, now = new Date()) {
    if (!snapshot) return instrument?.freshnessStatus || 'UNAVAILABLE'
    const pricedAt = new Date(snapshot.pricedAt)
    if (Number.isNaN(pricedAt.getTime())) return 'UNKNOWN'
    const staleAfterHours = Number(instrument?.staleAfterHours || 24)
    const ageMs = now.getTime() - pricedAt.getTime()
    return ageMs <= staleAfterHours * 60 * 60 * 1000 ? 'FRESH' : 'STALE'
}

function deterministicMockPrice(symbol) {
    const normalized = normalizeSymbol(symbol)
    const seed = [...normalized].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0)
    return Number(((seed % 9000) / 100 + 10).toFixed(2))
}

function shouldSimulateProviderFailure(provider) {
    return PROVIDER_FAILURE_VALUES.has(normalizeProvider(provider))
}

function buildInstrumentPayload(data) {
    const symbol = normalizeSymbol(data?.symbol)
    const quoteCurrency = normalizeCurrency(data?.currency || data?.quoteCurrency)
    const exchange = normalizeExchange(data?.exchange || data?.exchangeCode)
    const provider = normalizeProvider(data?.provider)
    const instrumentType = normalizeInstrumentType(data?.instrumentType || data?.type)
    const name = normalizeText(data?.name)
    const note = normalizeText(data?.note)
    const staleAfterHours = Number(data?.staleAfterHours || 24)

    if (!Number.isInteger(staleAfterHours) || staleAfterHours <= 0) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'La durée de fraîcheur doit être un nombre entier positif.',
            {fieldName: 'staleAfterHours', value: data?.staleAfterHours},
        )
    }

    return {
        instrumentKey: buildInstrumentKey({symbol, exchange, quoteCurrency, provider}),
        symbol,
        name,
        instrumentType,
        exchange,
        quoteCurrency,
        provider,
        isActive: true,
        note,
        staleAfterHours,
    }
}

function instrumentInclude() {
    return {
        priceSnapshots: {
            orderBy: [{pricedAt: 'desc'}, {id: 'desc'}],
            take: 1,
        },
    }
}

function toWatchlistItem(row, now = new Date()) {
    const lastSnapshot = row.priceSnapshots?.[0] || null
    const freshnessStatus = computeFreshnessStatus(row, lastSnapshot, now)
    return {
        id: row.id,
        instrumentId: row.id,
        targetCurrency: row.quoteCurrency,
        displayOrder: row.id,
        stalenessStatus: mapFreshnessToStaleness(freshnessStatus),
        freshnessStatus,
        note: row.note || null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        lastSnapshot: toSnapshotDto(lastSnapshot, row.symbol),
        instrument: {
            id: row.id,
            instrumentKey: row.instrumentKey,
            symbol: row.symbol,
            name: row.name || null,
            type: row.instrumentType,
            instrumentType: row.instrumentType,
            currency: row.quoteCurrency,
            quoteCurrency: row.quoteCurrency,
            exchangeCode: row.exchange || null,
            exchangeName: row.exchange || null,
            exchange: row.exchange || null,
            provider: row.provider || null,
            isActive: row.isActive,
            currentPrice: row.currentPrice ?? null,
            currentPriceCurrency: row.currentPriceCurrency || null,
            currentPriceQuotedAt: toIso(row.currentPriceQuotedAt),
            currentPriceProvider: row.currentPriceProvider || null,
            freshnessStatus: row.freshnessStatus || freshnessStatus,
            staleAfterHours: row.staleAfterHours || 24,
            note: row.note || null,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
        },
    }
}

async function listWatchlist(prisma, options = {}, {now = new Date()} = {}) {
    const where = {isActive: true}
    const search = normalizeText(options?.search)
    if (search) {
        where.OR = [
            {symbol: {contains: search.toUpperCase()}},
            {name: {contains: search}},
            {exchange: {contains: search.toUpperCase()}},
            {provider: {contains: search.toLowerCase()}},
        ]
    }

    const rows = await prisma.marketInstrument.findMany({
        where,
        include: instrumentInclude(),
        orderBy: [{symbol: 'asc'}, {id: 'asc'}],
    })

    return rows.map((row) => toWatchlistItem(row, now))
}

async function createWatchlistInstrument(prisma, data, {now = new Date()} = {}) {
    const payload = buildInstrumentPayload(data)
    const row = await prisma.marketInstrument.upsert({
        where: {instrumentKey: payload.instrumentKey},
        create: payload,
        update: {
            ...payload,
            isActive: true,
        },
        include: instrumentInclude(),
    })

    return toWatchlistItem(row, now)
}

async function removeWatchlistInstrument(prisma, id) {
    const instrumentId = requirePositiveId(id)
    await prisma.marketInstrument.update({
        where: {id: instrumentId},
        data: {isActive: false},
    })
    return {ok: true, id: instrumentId, entityType: 'watchlistItem'}
}

async function refreshWatchlist(prisma, options = {}, {now = new Date()} = {}) {
    const ids = Array.isArray(options?.instrumentIds)
        ? options.instrumentIds.map((id) => requirePositiveId(id)).filter(Boolean)
        : []
    const where = ids.length ? {id: {in: ids}, isActive: true} : {isActive: true}
    const instruments = await prisma.marketInstrument.findMany({
        where,
        include: instrumentInclude(),
        orderBy: [{symbol: 'asc'}, {id: 'asc'}],
    })

    const requestedAt = now
    const quotes = []
    const snapshots = []
    const errors = []

    for (const instrument of instruments) {
        const provider = normalizeProvider(options?.providerId || instrument.provider)

        if (shouldSimulateProviderFailure(provider)) {
            await prisma.marketInstrument.update({
                where: {id: instrument.id},
                data: {
                    freshnessStatus: instrument.priceSnapshots?.[0] ? 'STALE' : 'UNAVAILABLE',
                    freshnessCheckedAt: requestedAt,
                },
            })
            errors.push({
                status: 'PROVIDER_UNAVAILABLE',
                message: `Provider ${provider} indisponible. Dernier snapshot local conservé.`,
                providerId: provider,
                symbol: instrument.symbol,
                instrumentId: instrument.id,
                retryAfterSeconds: null,
                recoverable: true,
            })
            continue
        }

        const unitPrice = deterministicMockPrice(instrument.symbol)
        const snapshot = await prisma.priceSnapshot.create({
            data: {
                marketInstrumentId: instrument.id,
                unitPrice,
                currency: instrument.quoteCurrency,
                pricedAt: requestedAt,
                retrievedAt: requestedAt,
                provider,
                source: 'API',
                freshnessStatus: 'FRESH',
                note: `Quote mock/local générée par ${provider}.`,
            },
        })

        await prisma.marketInstrument.update({
            where: {id: instrument.id},
            data: {
                currentPrice: unitPrice,
                currentPriceCurrency: instrument.quoteCurrency,
                currentPriceQuotedAt: requestedAt,
                currentPriceProvider: provider,
                freshnessStatus: 'FRESH',
                freshnessCheckedAt: requestedAt,
            },
        })

        quotes.push({
            providerId: provider,
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            unitPrice,
            currency: instrument.quoteCurrency,
            pricedAt: requestedAt.toISOString(),
            retrievedAt: requestedAt.toISOString(),
            stalenessStatus: 'FRESH',
            freshnessStatus: 'FRESH',
            timeGranularity: 'DELAYED',
            previousClose: null,
            change: null,
            changePercent: null,
        })
        snapshots.push(toSnapshotDto(snapshot, instrument.symbol))
    }

    const completedAt = new Date()
    const status = errors.length === 0
        ? 'SUCCESS'
        : snapshots.length > 0
            ? 'PARTIAL_SUCCESS'
            : 'FAILED'

    return {
        status,
        providerId: options?.providerId || 'local',
        requestedAt: requestedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        requestedSymbols: instruments.map((instrument) => instrument.symbol),
        quotes,
        snapshots,
        errors,
        summary: {
            requested: instruments.length,
            succeeded: snapshots.length,
            failed: errors.length,
            skipped: 0,
            stale: errors.length,
            missing: instruments.length === 0 ? 1 : 0,
        },
    }
}


function createMarketDataWatchlistHandlers({prisma, now = () => new Date()} = {}) {
    if (!prisma) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'Le client Prisma est obligatoire pour créer les handlers watchlist.',
        )
    }

    return {
        listWatchlist: (options) => listWatchlist(prisma, options, {now: now()}),
        createWatchlistInstrument: (data) => createWatchlistInstrument(prisma, data, {now: now()}),
        removeWatchlistInstrument: (id) => removeWatchlistInstrument(prisma, id),
        refreshWatchlist: (options) => refreshWatchlist(prisma, options, {now: now()}),
    }
}

module.exports = {
    MARKET_INSTRUMENT_TYPES,
    FRESHNESS_STATUSES,
    buildInstrumentKey,
    buildInstrumentPayload,
    computeFreshnessStatus,
    createMarketDataWatchlistHandlers,
    createWatchlistInstrument,
    deterministicMockPrice,
    listWatchlist,
    mapFreshnessToStaleness,
    refreshWatchlist,
    removeWatchlistInstrument,
    shouldSimulateProviderFailure,
    toWatchlistItem,
}
