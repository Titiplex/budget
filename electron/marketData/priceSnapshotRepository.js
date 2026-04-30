const {createValuationError} = require('./valuationErrors')

const DB_FRESHNESS_STATUSES = ['UNKNOWN', 'FRESH', 'STALE', 'UNAVAILABLE', 'ERROR']
const USABLE_DB_FRESHNESS_STATUSES = ['FRESH', 'STALE', 'UNKNOWN']
const DEFAULT_STALE_AFTER_HOURS = 24

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCurrency(value, fallback = 'CAD') {
    return (normalizeText(value) || fallback).toUpperCase()
}

function normalizeId(value, fieldName) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createValuationError('REPOSITORY_ERROR', `${fieldName} est invalide.`)
    }
    return parsed
}

function normalizePositiveNumber(value, fieldName) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw createValuationError('INVALID_PRICE', `${fieldName} doit être un nombre strictement positif.`)
    }
    return parsed
}

function normalizeDate(value, fieldName, fallback = new Date()) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = candidate instanceof Date ? new Date(candidate.getTime()) : new Date(candidate)
    if (Number.isNaN(parsed.getTime())) {
        throw createValuationError('REPOSITORY_ERROR', `${fieldName} est invalide.`)
    }
    return parsed
}

function normalizeProvider(value) {
    return normalizeText(value) || 'manual'
}

function mapSnapshotSourceToDb(value) {
    const normalized = normalizeText(value)?.toUpperCase()
    if (normalized === 'PROVIDER') return 'API'
    if (normalized === 'API') return 'API'
    if (normalized === 'IMPORTED') return 'IMPORTED'
    return 'MANUAL'
}

function mapSnapshotSourceFromDb(value) {
    const normalized = normalizeText(value)?.toUpperCase()
    if (normalized === 'API') return 'PROVIDER'
    if (normalized === 'IMPORTED') return 'IMPORTED'
    return 'MANUAL'
}

function mapFreshnessToDb(value) {
    const normalized = normalizeText(value)?.toUpperCase()
    if (normalized === 'MISSING') return 'UNAVAILABLE'
    if (normalized === 'EXPIRED') return 'STALE'
    if (DB_FRESHNESS_STATUSES.includes(normalized)) return normalized
    return 'UNKNOWN'
}

function mapFreshnessFromDb(value) {
    const normalized = normalizeText(value)?.toUpperCase()
    if (normalized === 'UNAVAILABLE' || normalized === 'ERROR') return 'MISSING'
    if (normalized === 'STALE') return 'STALE'
    if (normalized === 'FRESH') return 'FRESH'
    return 'UNKNOWN'
}

function normalizeFreshnessStatus(value) {
    return mapFreshnessToDb(value)
}

function getReferenceDate(options = {}) {
    return options.now instanceof Date ? new Date(options.now.getTime()) : normalizeDate(options.now, 'La date de référence', new Date())
}

function getStaleAfterHours(snapshot, options = {}) {
    const raw =
        options.staleAfterHours ??
        snapshot?.marketInstrument?.staleAfterHours ??
        snapshot?.staleAfterHours ??
        DEFAULT_STALE_AFTER_HOURS
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STALE_AFTER_HOURS
}

function calculateSnapshotFreshness(snapshot, options = {}) {
    if (!snapshot) return 'MISSING'
    const baseStatus = mapFreshnessFromDb(snapshot.freshnessStatus ?? snapshot.stalenessStatus)
    if (baseStatus === 'MISSING') return 'MISSING'
    if (baseStatus === 'STALE') return 'STALE'

    const pricedAt = normalizeDate(snapshot.pricedAt, 'La date de prix')
    const referenceDate = getReferenceDate(options)
    const staleAfterHours = getStaleAfterHours(snapshot, options)
    const ageMs = Math.max(0, referenceDate.getTime() - pricedAt.getTime())
    if (staleAfterHours > 0 && ageMs > staleAfterHours * 60 * 60 * 1000) {
        return 'STALE'
    }

    if (baseStatus === 'FRESH') return 'FRESH'
    return 'UNKNOWN'
}

function isSnapshotUsable(snapshot, options = {}) {
    if (!snapshot) return false
    const price = Number(snapshot.unitPrice)
    if (!Number.isFinite(price) || price <= 0) return false
    const dbStatus = mapFreshnessToDb(snapshot.freshnessStatus ?? snapshot.stalenessStatus)
    if (!USABLE_DB_FRESHNESS_STATUSES.includes(dbStatus)) return false
    if (options.freshOnly && calculateSnapshotFreshness(snapshot, options) !== 'FRESH') return false
    return true
}

function normalizePriceSnapshotRow(row, options = {}) {
    if (!row) return null
    const now = getReferenceDate(options).toISOString()
    const pricedAt = normalizeDate(row.pricedAt, 'La date de prix').toISOString()
    const retrievedAt = row.retrievedAt ? normalizeDate(row.retrievedAt, 'La date de récupération').toISOString() : now
    const marketInstrument = row.marketInstrument || null
    const freshnessStatus = calculateSnapshotFreshness(row, options)

    return {
        id: row.id ?? null,
        instrumentId: row.marketInstrumentId ?? row.instrumentId ?? null,
        marketInstrumentId: row.marketInstrumentId ?? row.instrumentId ?? null,
        holdingLotId: row.holdingLotId ?? null,
        providerId: row.provider ?? row.providerId ?? null,
        provider: row.provider ?? row.providerId ?? null,
        symbol: row.symbol || marketInstrument?.symbol || null,
        unitPrice: Number(row.unitPrice),
        currency: normalizeCurrency(row.currency),
        pricedAt,
        retrievedAt,
        source: mapSnapshotSourceFromDb(row.source),
        freshnessStatus,
        stalenessStatus: freshnessStatus,
        dbFreshnessStatus: normalizeFreshnessStatus(row.freshnessStatus),
        timeGranularity: row.timeGranularity || 'UNKNOWN',
        note: row.note || null,
        createdAt: row.createdAt ? normalizeDate(row.createdAt, 'La date de création').toISOString() : now,
        updatedAt: row.updatedAt ? normalizeDate(row.updatedAt, 'La date de mise à jour').toISOString() : now,
        marketInstrument,
    }
}

function buildSnapshotCreateData(snapshot, options = {}) {
    const marketInstrumentId = normalizeId(
        snapshot.marketInstrumentId ?? snapshot.instrumentId,
        "L'instrument de marché",
    )
    const holdingLotId = normalizeId(snapshot.holdingLotId, 'Le lot de portefeuille')
    if (!marketInstrumentId && !holdingLotId) {
        throw createValuationError(
            'INSTRUMENT_REQUIRED',
            'Un snapshot doit être lié à un instrument de marché ou à un lot.',
        )
    }

    const provider = normalizeProvider(snapshot.provider ?? snapshot.providerId)
    const pricedAt = normalizeDate(snapshot.pricedAt ?? snapshot.asOf, 'La date de prix', getReferenceDate(options))
    const retrievedAt = normalizeDate(snapshot.retrievedAt, 'La date de récupération', getReferenceDate(options))

    return {
        unitPrice: normalizePositiveNumber(snapshot.unitPrice ?? snapshot.price, 'Le prix unitaire'),
        currency: normalizeCurrency(snapshot.currency),
        pricedAt,
        provider,
        source: mapSnapshotSourceToDb(snapshot.source),
        freshnessStatus: normalizeFreshnessStatus(snapshot.freshnessStatus ?? snapshot.stalenessStatus),
        retrievedAt,
        note: normalizeText(snapshot.note),
        holdingLotId,
        marketInstrumentId,
    }
}

function buildSnapshotWhere({instrumentId, holdingLotId, currency, asOf, freshOnly}) {
    const where = {
        freshnessStatus: {in: freshOnly ? ['FRESH'] : USABLE_DB_FRESHNESS_STATUSES},
    }

    const normalizedInstrumentId = normalizeId(instrumentId, "L'instrument de marché")
    const normalizedHoldingLotId = normalizeId(holdingLotId, 'Le lot de portefeuille')
    if (normalizedInstrumentId) where.marketInstrumentId = normalizedInstrumentId
    if (normalizedHoldingLotId) where.holdingLotId = normalizedHoldingLotId
    if (!normalizedInstrumentId && !normalizedHoldingLotId) {
        throw createValuationError(
            'INSTRUMENT_REQUIRED',
            'Un instrument ou un lot est requis pour lire un snapshot.',
        )
    }
    if (currency) where.currency = normalizeCurrency(currency)
    if (asOf) where.pricedAt = {lte: normalizeDate(asOf, 'La date de valorisation')}
    return where
}

function createPriceSnapshotRepository(prisma, options = {}) {
    if (!prisma?.priceSnapshot) {
        throw createValuationError('REPOSITORY_ERROR', 'Le delegate Prisma priceSnapshot est obligatoire.')
    }

    async function createSnapshot(snapshot, createOptions = {}) {
        const data = buildSnapshotCreateData(snapshot, {...options, ...createOptions})
        const include = {marketInstrument: true, holdingLot: true}
        const created = await prisma.priceSnapshot.create({data, include})

        if (data.marketInstrumentId && createOptions.updateInstrumentCache !== false && prisma.marketInstrument?.update) {
            await prisma.marketInstrument.update({
                where: {id: data.marketInstrumentId},
                data: {
                    currentPrice: data.unitPrice,
                    currentPriceCurrency: data.currency,
                    currentPriceQuotedAt: data.pricedAt,
                    currentPriceProvider: data.provider,
                    freshnessStatus: data.freshnessStatus,
                    freshnessCheckedAt: data.retrievedAt,
                },
            })
        }

        return normalizePriceSnapshotRow(created, {...options, ...createOptions})
    }

    async function createSnapshots(snapshots, createOptions = {}) {
        const rows = []
        for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
            rows.push(await createSnapshot(snapshot, createOptions))
        }
        return rows
    }

    async function listSnapshotsForInstrument(instrumentId, listOptions = {}) {
        const where = buildSnapshotWhere({
            instrumentId,
            currency: listOptions.currency,
            asOf: listOptions.asOf,
            freshOnly: listOptions.freshOnly,
        })
        const rows = await prisma.priceSnapshot.findMany({
            where,
            include: {marketInstrument: true, holdingLot: true},
            orderBy: {pricedAt: 'desc'},
            take: listOptions.limit || undefined,
        })
        return rows.map((row) => normalizePriceSnapshotRow(row, {...options, ...listOptions}))
    }

    async function getLatestUsableSnapshot(instrumentId, lookupOptions = {}) {
        const where = buildSnapshotWhere({
            instrumentId,
            holdingLotId: lookupOptions.holdingLotId,
            currency: lookupOptions.currency,
            asOf: lookupOptions.asOf,
            freshOnly: lookupOptions.freshOnly,
        })
        const rows = await prisma.priceSnapshot.findMany({
            where,
            include: {marketInstrument: true, holdingLot: true},
            orderBy: {pricedAt: 'desc'},
            take: lookupOptions.scanLimit || 10,
        })
        const usable = rows.find((row) => isSnapshotUsable(row, {...options, ...lookupOptions}))
        return normalizePriceSnapshotRow(usable, {...options, ...lookupOptions})
    }

    async function getLatestSnapshotForHoldingLot(holdingLotId, lookupOptions = {}) {
        const where = buildSnapshotWhere({
            holdingLotId,
            currency: lookupOptions.currency,
            asOf: lookupOptions.asOf,
            freshOnly: lookupOptions.freshOnly,
        })
        const rows = await prisma.priceSnapshot.findMany({
            where,
            include: {marketInstrument: true, holdingLot: true},
            orderBy: {pricedAt: 'desc'},
            take: lookupOptions.scanLimit || 10,
        })
        const usable = rows.find((row) => isSnapshotUsable(row, {...options, ...lookupOptions}))
        return normalizePriceSnapshotRow(usable, {...options, ...lookupOptions})
    }

    return {
        createSnapshot,
        createSnapshots,
        writeSnapshot: createSnapshot,
        writeSnapshots: createSnapshots,
        listSnapshotsForInstrument,
        getLatestUsableSnapshot,
        getLatestSnapshotForHoldingLot,
        normalizePriceSnapshotRow: (row, rowOptions) => normalizePriceSnapshotRow(row, {...options, ...rowOptions}),
    }
}

module.exports = {
    DB_FRESHNESS_STATUSES,
    DEFAULT_STALE_AFTER_HOURS,
    USABLE_DB_FRESHNESS_STATUSES,
    calculateSnapshotFreshness,
    createPriceSnapshotRepository,
    isSnapshotUsable,
    mapFreshnessFromDb,
    mapFreshnessToDb,
    mapSnapshotSourceFromDb,
    mapSnapshotSourceToDb,
    normalizePriceSnapshotRow,
}
