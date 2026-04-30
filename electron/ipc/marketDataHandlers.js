const MARKET_DATA_ERROR_CODES = Object.freeze({
    PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    UNKNOWN_SYMBOL: 'UNKNOWN_SYMBOL',
    NO_LOCAL_DATA: 'NO_LOCAL_DATA',
    STALE_DATA: 'STALE_DATA',
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_PRICE: 'INVALID_PRICE',
    INVALID_PROVIDER_RESPONSE: 'INVALID_PROVIDER_RESPONSE',
    REPOSITORY_ERROR: 'REPOSITORY_ERROR',
})

const MARKET_DATA_REFRESH_STATUSES = Object.freeze({
    REFRESHED: 'REFRESHED',
    FAILED_WITH_FALLBACK: 'FAILED_WITH_FALLBACK',
    FAILED_NO_DATA: 'FAILED_NO_DATA',
})

class MarketDataIpcError extends Error {
    constructor(code, message, details = undefined) {
        super(message)
        this.name = 'MarketDataIpcError'
        this.code = code
        this.details = details
    }
}

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeUpperText(value) {
    const text = normalizeText(value)
    return text ? text.toUpperCase() : null
}

function normalizeIntegerId(value, fieldName = 'id') {
    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            `${fieldName} doit être un identifiant entier positif.`,
            {fieldName, value},
        )
    }

    return parsed
}

function normalizeLimit(value, fallback = 30, max = 365) {
    if (value == null || value === '') return fallback
    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'La limite doit être un entier strictement positif.',
            {value},
        )
    }

    return Math.min(parsed, max)
}

function normalizeDate(value, fieldName) {
    if (value == null || value === '') return null
    const date = value instanceof Date ? value : new Date(value)

    if (Number.isNaN(date.getTime())) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            `${fieldName} doit être une date valide.`,
            {fieldName, value},
        )
    }

    return date
}

function toIso(value) {
    if (!value) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100
}

function toIpcError(error, fallbackCode = MARKET_DATA_ERROR_CODES.REPOSITORY_ERROR) {
    if (error instanceof MarketDataIpcError) {
        return {
            code: error.code,
            message: error.message,
            details: error.details || null,
        }
    }

    return {
        code: error?.code || fallbackCode,
        message: error?.message || 'Erreur de données de marché inconnue.',
        details: error?.details || null,
    }
}

function calculateFreshnessStatus(row, now = new Date()) {
    if (!row) return 'UNAVAILABLE'

    if (row.freshnessStatus && row.freshnessStatus !== 'UNKNOWN') {
        return row.freshnessStatus
    }

    const pricedAt = row.pricedAt || row.currentPriceQuotedAt
    const staleAfterHours = Number(row.staleAfterHours || row.marketInstrument?.staleAfterHours || 24)

    if (!pricedAt || !Number.isFinite(staleAfterHours) || staleAfterHours <= 0) {
        return row.freshnessStatus || 'UNKNOWN'
    }

    const ageMs = now.getTime() - new Date(pricedAt).getTime()
    return ageMs <= staleAfterHours * 60 * 60 * 1000 ? 'FRESH' : 'STALE'
}

function serializeInstrument(row, now = new Date()) {
    if (!row) return null

    return {
        id: row.id,
        instrumentKey: row.instrumentKey,
        symbol: row.symbol,
        name: row.name || null,
        instrumentType: row.instrumentType || 'OTHER',
        exchange: row.exchange || null,
        quoteCurrency: row.quoteCurrency || 'CAD',
        provider: row.provider || null,
        providerInstrumentId: row.providerInstrumentId || null,
        currentPrice: row.currentPrice ?? null,
        currentPriceCurrency: row.currentPriceCurrency || null,
        currentPriceQuotedAt: toIso(row.currentPriceQuotedAt),
        currentPriceProvider: row.currentPriceProvider || null,
        freshnessStatus: calculateFreshnessStatus(row, now),
        freshnessCheckedAt: toIso(row.freshnessCheckedAt),
        staleAfterHours: row.staleAfterHours ?? 24,
        isActive: row.isActive !== false,
        note: row.note || null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    }
}

function serializeSnapshot(row, now = new Date()) {
    if (!row) return null

    const status = calculateFreshnessStatus(row, now)

    return {
        id: row.id,
        marketInstrumentId: row.marketInstrumentId ?? null,
        holdingLotId: row.holdingLotId ?? null,
        unitPrice: row.unitPrice,
        currency: row.currency || 'CAD',
        pricedAt: toIso(row.pricedAt),
        provider: row.provider || 'manual',
        source: row.source || 'MANUAL',
        freshnessStatus: status,
        retrievedAt: toIso(row.retrievedAt),
        note: row.note || null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    }
}

function buildInstrumentWhere(filters = {}) {
    const where = {}
    const activeOnly = filters.activeOnly !== false
    const ids = Array.isArray(filters.ids)
        ? filters.ids.map((id) => normalizeIntegerId(id, 'instrumentId'))
        : []
    const symbol = normalizeUpperText(filters.symbol)
    const provider = normalizeText(filters.provider)
    const exchange = normalizeUpperText(filters.exchange)
    const quoteCurrency = normalizeUpperText(filters.quoteCurrency)
    const search = normalizeText(filters.search)

    if (activeOnly) where.isActive = true
    if (ids.length) where.id = {in: ids}
    if (symbol) where.symbol = symbol
    if (provider) where.provider = provider
    if (exchange) where.exchange = exchange
    if (quoteCurrency) where.quoteCurrency = quoteCurrency

    if (search) {
        where.OR = [
            {symbol: {contains: search.toUpperCase()}},
            {name: {contains: search}},
            {providerInstrumentId: {contains: search}},
        ]
    }

    return where
}

function buildSnapshotWhere(options = {}) {
    const where = {}

    if (options.instrumentId != null) {
        where.marketInstrumentId = normalizeIntegerId(options.instrumentId, 'instrumentId')
    }

    if (options.holdingLotId != null) {
        where.holdingLotId = normalizeIntegerId(options.holdingLotId, 'holdingLotId')
    }

    const from = normalizeDate(options.from, 'from')
    const to = normalizeDate(options.to, 'to')

    if (from || to) {
        where.pricedAt = {}
        if (from) where.pricedAt.gte = from
        if (to) where.pricedAt.lte = to
    }

    const provider = normalizeText(options.provider)
    if (provider) where.provider = provider

    return where
}

async function listInstruments(prisma, filters = {}, {now = new Date()} = {}) {
    const rows = await prisma.marketInstrument.findMany({
        where: buildInstrumentWhere(filters),
        orderBy: [{symbol: 'asc'}, {exchange: 'asc'}, {provider: 'asc'}],
    })

    return rows.map((row) => serializeInstrument(row, now))
}

async function resolveInstrument(prisma, options = {}) {
    if (options.instrumentId != null || options.id != null) {
        const id = normalizeIntegerId(options.instrumentId ?? options.id, 'instrumentId')
        const row = await prisma.marketInstrument.findUnique({where: {id}})

        if (!row) {
            throw new MarketDataIpcError(
                MARKET_DATA_ERROR_CODES.UNKNOWN_SYMBOL,
                'Instrument de marché introuvable.',
                {instrumentId: id},
            )
        }

        return row
    }

    const symbol = normalizeUpperText(options.symbol)

    if (!symbol) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'Un instrumentId ou un symbole est obligatoire.',
        )
    }

    const where = {symbol}
    const exchange = normalizeUpperText(options.exchange)
    const provider = normalizeText(options.provider)
    const quoteCurrency = normalizeUpperText(options.quoteCurrency)

    if (exchange) where.exchange = exchange
    if (provider) where.provider = provider
    if (quoteCurrency) where.quoteCurrency = quoteCurrency

    const row = await prisma.marketInstrument.findFirst({
        where,
        orderBy: [{isActive: 'desc'}, {id: 'asc'}],
    })

    if (!row) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.UNKNOWN_SYMBOL,
            'Symbole de marché non reconnu.',
            {symbol, exchange: exchange || null, provider: provider || null},
        )
    }

    return row
}

async function getLatestSnapshotRow(prisma, options = {}) {
    const where = buildSnapshotWhere(options)

    if (!where.marketInstrumentId && !where.holdingLotId) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'Un instrumentId ou un holdingLotId est obligatoire pour lire un snapshot.',
        )
    }

    return prisma.priceSnapshot.findFirst({
        where,
        orderBy: [{pricedAt: 'desc'}, {retrievedAt: 'desc'}, {id: 'desc'}],
    })
}

async function getLatestSnapshot(prisma, options = {}, {now = new Date()} = {}) {
    const row = await getLatestSnapshotRow(prisma, options)

    if (!row) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.NO_LOCAL_DATA,
            'Aucun snapshot local disponible pour cet instrument.',
            options.instrumentId ? {instrumentId: Number(options.instrumentId)} : {holdingLotId: Number(options.holdingLotId)},
        )
    }

    return serializeSnapshot(row, now)
}

async function listSnapshotHistory(prisma, options = {}, {now = new Date()} = {}) {
    const limit = normalizeLimit(options.limit, 30, 1000)
    const where = buildSnapshotWhere(options)

    if (!where.marketInstrumentId && !where.holdingLotId) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'Un instrumentId ou un holdingLotId est obligatoire pour lire un historique.',
        )
    }

    const rows = await prisma.priceSnapshot.findMany({
        where,
        orderBy: [{pricedAt: 'desc'}, {retrievedAt: 'desc'}, {id: 'desc'}],
        take: limit,
    })

    return rows.map((row) => serializeSnapshot(row, now))
}

function normalizeQuote(quote, instrument) {
    const unitPrice = Number(
        quote?.unitPrice ?? quote?.price ?? quote?.regularMarketPrice ?? quote?.close ?? quote?.value,
    )

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_PRICE,
            'Le provider a retourné un prix invalide.',
            {symbol: instrument.symbol, price: quote?.price ?? quote?.unitPrice ?? null},
        )
    }

    const pricedAt = normalizeDate(
        quote?.pricedAt ?? quote?.quoteTime ?? quote?.timestamp ?? quote?.date ?? new Date(),
        'pricedAt',
    )
    const currency = normalizeUpperText(quote?.currency) || instrument.quoteCurrency || 'CAD'
    const provider = normalizeText(quote?.provider) || normalizeText(instrument.provider) || 'manual'

    return {
        unitPrice,
        currency,
        pricedAt,
        provider,
        source: quote?.source || 'API',
        freshnessStatus: quote?.freshnessStatus || 'FRESH',
        retrievedAt: normalizeDate(quote?.retrievedAt ?? new Date(), 'retrievedAt'),
        note: quote?.note || null,
    }
}

async function readProviderQuote(provider, instrument) {
    if (!provider) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.PROVIDER_UNAVAILABLE,
            'Aucun provider de données de marché actif.',
        )
    }

    if (typeof provider.getQuote === 'function') {
        return provider.getQuote(instrument)
    }

    if (typeof provider.fetchQuote === 'function') {
        return provider.fetchQuote(instrument)
    }

    if (typeof provider.getQuotes === 'function') {
        const quotes = await provider.getQuotes([instrument])
        const quote = Array.isArray(quotes) ? quotes[0] : quotes?.[instrument.symbol]

        if (!quote) {
            throw new MarketDataIpcError(
                MARKET_DATA_ERROR_CODES.UNKNOWN_SYMBOL,
                'Le provider ne connaît pas ce symbole.',
                {symbol: instrument.symbol},
            )
        }

        return quote
    }

    throw new MarketDataIpcError(
        MARKET_DATA_ERROR_CODES.PROVIDER_UNAVAILABLE,
        'Le provider actif ne supporte pas la lecture de quote.',
        {providerId: provider.id || provider.name || null},
    )
}

async function saveSnapshot(prisma, instrument, quote, {now = new Date()} = {}) {
    const normalized = normalizeQuote(quote, instrument)
    const where = {
        marketInstrumentId: instrument.id,
        pricedAt: normalized.pricedAt,
        currency: normalized.currency,
        provider: normalized.provider,
    }

    const existing = await prisma.priceSnapshot.findFirst({where})
    const snapshotData = {
        unitPrice: normalized.unitPrice,
        currency: normalized.currency,
        pricedAt: normalized.pricedAt,
        provider: normalized.provider,
        source: normalized.source,
        freshnessStatus: normalized.freshnessStatus,
        retrievedAt: normalized.retrievedAt || now,
        note: normalized.note,
        marketInstrumentId: instrument.id,
    }

    const snapshot = existing
        ? await prisma.priceSnapshot.update({where: {id: existing.id}, data: snapshotData})
        : await prisma.priceSnapshot.create({data: snapshotData})

    const updatedInstrument = await prisma.marketInstrument.update({
        where: {id: instrument.id},
        data: {
            currentPrice: snapshot.unitPrice,
            currentPriceCurrency: snapshot.currency,
            currentPriceQuotedAt: snapshot.pricedAt,
            currentPriceProvider: snapshot.provider,
            freshnessStatus: snapshot.freshnessStatus,
            freshnessCheckedAt: now,
        },
    })

    return {snapshot, instrument: updatedInstrument}
}

async function refreshMarketData(prisma, provider, options = {}, {now = new Date()} = {}) {
    const instrument = await resolveInstrument(prisma, options)

    try {
        const quote = await readProviderQuote(provider, instrument)
        const saved = await saveSnapshot(prisma, instrument, quote, {now})

        return {
            status: MARKET_DATA_REFRESH_STATUSES.REFRESHED,
            instrument: serializeInstrument(saved.instrument, now),
            snapshot: serializeSnapshot(saved.snapshot, now),
            error: null,
            fallbackSnapshot: null,
        }
    } catch (error) {
        const normalizedError = toIpcError(error, MARKET_DATA_ERROR_CODES.PROVIDER_UNAVAILABLE)
        const fallbackSnapshot = await getLatestSnapshotRow(prisma, {instrumentId: instrument.id})

        if (fallbackSnapshot) {
            return {
                status: MARKET_DATA_REFRESH_STATUSES.FAILED_WITH_FALLBACK,
                instrument: serializeInstrument(instrument, now),
                snapshot: null,
                error: normalizedError,
                fallbackSnapshot: serializeSnapshot(fallbackSnapshot, now),
            }
        }

        return {
            status: MARKET_DATA_REFRESH_STATUSES.FAILED_NO_DATA,
            instrument: serializeInstrument(instrument, now),
            snapshot: null,
            error: normalizedError,
            fallbackSnapshot: null,
        }
    }
}

async function listFreshnessStatuses(prisma, filters = {}, {now = new Date()} = {}) {
    const instruments = await listInstruments(prisma, filters, {now})

    return instruments.map((instrument) => ({
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        provider: instrument.provider,
        quoteCurrency: instrument.quoteCurrency,
        currentPrice: instrument.currentPrice,
        currentPriceCurrency: instrument.currentPriceCurrency,
        currentPriceQuotedAt: instrument.currentPriceQuotedAt,
        freshnessStatus: instrument.freshnessStatus,
        freshnessCheckedAt: instrument.freshnessCheckedAt,
        staleAfterHours: instrument.staleAfterHours,
    }))
}

function getQuantity(options, fallback) {
    const raw = options?.quantity ?? fallback
    const quantity = Number(raw)

    if (!Number.isFinite(quantity) || quantity < 0) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'La quantité doit être un nombre positif ou nul.',
            {quantity: raw},
        )
    }

    return quantity
}

async function getAssetValuation(prisma, options = {}, {now = new Date()} = {}) {
    const targetCurrency = normalizeUpperText(options.targetCurrency)

    if (options.holdingLotId != null) {
        const holdingLotId = normalizeIntegerId(options.holdingLotId, 'holdingLotId')
        const lot = await prisma.holdingLot.findUnique({
            where: {id: holdingLotId},
            include: {marketInstrument: true},
        })

        if (!lot) {
            throw new MarketDataIpcError(
                MARKET_DATA_ERROR_CODES.INVALID_INPUT,
                'Lot de portefeuille introuvable.',
                {holdingLotId},
            )
        }

        const quantity = getQuantity(options, lot.quantity)
        const snapshot = lot.marketInstrumentId
            ? await getLatestSnapshotRow(prisma, {instrumentId: lot.marketInstrumentId})
            : await getLatestSnapshotRow(prisma, {holdingLotId}).catch(() => null)

        if (snapshot) {
            const currency = snapshot.currency || lot.currency || 'CAD'

            if (targetCurrency && targetCurrency !== currency) {
                throw new MarketDataIpcError(
                    MARKET_DATA_ERROR_CODES.INVALID_INPUT,
                    'La conversion FX automatique de valorisation n’est pas encore exposée par cet IPC.',
                    {from: currency, to: targetCurrency},
                )
            }

            return {
                entityType: 'holdingLot',
                entityId: lot.id,
                label: lot.name,
                status: calculateFreshnessStatus(snapshot, now),
                valuationSource: 'LOCAL_SNAPSHOT',
                quantity,
                unitPrice: snapshot.unitPrice,
                currency,
                marketValue: roundMoney(quantity * snapshot.unitPrice),
                pricedAt: toIso(snapshot.pricedAt),
                snapshot: serializeSnapshot(snapshot, now),
                error: null,
            }
        }

        if (lot.marketValue != null || lot.unitPrice != null) {
            const unitPrice = lot.unitPrice != null ? Number(lot.unitPrice) : null
            const manualValue = lot.marketValue != null ? Number(lot.marketValue) : quantity * unitPrice

            return {
                entityType: 'holdingLot',
                entityId: lot.id,
                label: lot.name,
                status: 'UNKNOWN',
                valuationSource: 'MANUAL_FALLBACK',
                quantity,
                unitPrice,
                currency: lot.currency || 'CAD',
                marketValue: roundMoney(manualValue),
                pricedAt: toIso(lot.valueAsOf),
                snapshot: null,
                error: null,
            }
        }

        return {
            entityType: 'holdingLot',
            entityId: lot.id,
            label: lot.name,
            status: 'UNAVAILABLE',
            valuationSource: 'UNAVAILABLE',
            quantity,
            unitPrice: null,
            currency: lot.currency || 'CAD',
            marketValue: null,
            pricedAt: null,
            snapshot: null,
            error: {
                code: MARKET_DATA_ERROR_CODES.NO_LOCAL_DATA,
                message: 'Aucun snapshot local ni valeur manuelle disponible pour ce lot.',
                details: {holdingLotId: lot.id},
            },
        }
    }

    if (options.assetId != null) {
        const assetId = normalizeIntegerId(options.assetId, 'assetId')
        const asset = await prisma.asset.findUnique({
            where: {id: assetId},
            include: {marketInstrument: true},
        })

        if (!asset) {
            throw new MarketDataIpcError(
                MARKET_DATA_ERROR_CODES.INVALID_INPUT,
                'Actif patrimonial introuvable.',
                {assetId},
            )
        }

        const ownershipPercent = Number(asset.ownershipPercent ?? 100)
        const manualValue = Number(asset.currentValue ?? 0) * (ownershipPercent / 100)

        return {
            entityType: 'asset',
            entityId: asset.id,
            label: asset.name,
            status: asset.marketInstrument?.freshnessStatus || 'UNKNOWN',
            valuationSource: 'MANUAL_FALLBACK',
            quantity: null,
            unitPrice: null,
            currency: asset.currency || 'CAD',
            marketValue: roundMoney(manualValue),
            pricedAt: toIso(asset.valueAsOf),
            snapshot: null,
            error: manualValue > 0
                ? null
                : {
                    code: MARKET_DATA_ERROR_CODES.NO_LOCAL_DATA,
                    message: 'Aucun snapshot exploitable ni valeur manuelle positive pour cet actif.',
                    details: {assetId: asset.id},
                },
        }
    }

    throw new MarketDataIpcError(
        MARKET_DATA_ERROR_CODES.INVALID_INPUT,
        'Un assetId ou un holdingLotId est obligatoire pour valoriser un actif.',
    )
}

function createMarketDataHandlers({prisma, provider = null, now = () => new Date()} = {}) {
    if (!prisma) {
        throw new MarketDataIpcError(
            MARKET_DATA_ERROR_CODES.INVALID_INPUT,
            'Le client Prisma est obligatoire pour créer les handlers market data.',
        )
    }

    const runtime = () => ({now: now()})

    return {
        listInstruments: (filters) => listInstruments(prisma, filters, runtime()),
        getLatestSnapshot: (options) => getLatestSnapshot(prisma, options, runtime()),
        listSnapshotHistory: (options) => listSnapshotHistory(prisma, options, runtime()),
        refresh: (options) => refreshMarketData(prisma, provider, options, runtime()),
        getAssetValuation: (options) => getAssetValuation(prisma, options, runtime()),
        listFreshnessStatuses: (filters) => listFreshnessStatuses(prisma, filters, runtime()),
    }
}

module.exports = {
    MARKET_DATA_ERROR_CODES,
    MARKET_DATA_REFRESH_STATUSES,
    MarketDataIpcError,
    calculateFreshnessStatus,
    createMarketDataHandlers,
    getAssetValuation,
    getLatestSnapshot,
    listFreshnessStatuses,
    listInstruments,
    listSnapshotHistory,
    normalizeQuote,
    refreshMarketData,
    serializeInstrument,
    serializeSnapshot,
    toIpcError,
}
