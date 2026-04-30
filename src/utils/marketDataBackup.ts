export type MarketBackupInstrumentType =
    | 'EQUITY'
    | 'ETF'
    | 'MUTUAL_FUND'
    | 'BOND'
    | 'CRYPTO'
    | 'OPTION'
    | 'COMMODITY'
    | 'FOREX'
    | 'INDEX'
    | 'FUND'
    | 'OTHER'

export type MarketBackupFreshnessStatus = 'UNKNOWN' | 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'ERROR'
export type MarketBackupSnapshotSource = 'MANUAL' | 'IMPORTED' | 'API'

export interface MarketDataBackupInstrument {
    id: number
    instrumentKey: string
    symbol: string
    name: string | null
    instrumentType: MarketBackupInstrumentType
    exchange: string | null
    quoteCurrency: string
    provider: string | null
    providerInstrumentId: string | null
    currentPrice: number | null
    currentPriceCurrency: string | null
    currentPriceQuotedAt: string | null
    currentPriceProvider: string | null
    freshnessStatus: MarketBackupFreshnessStatus
    freshnessCheckedAt: string | null
    staleAfterHours: number
    isActive: boolean
    note: string | null
}

export interface MarketDataBackupPriceSnapshot {
    id: number
    marketInstrumentId: number | null
    holdingLotId: number | null
    unitPrice: number
    currency: string
    pricedAt: string
    provider: string
    source: MarketBackupSnapshotSource
    freshnessStatus: MarketBackupFreshnessStatus
    retrievedAt: string
    note: string | null
}

export interface MarketDataBackupSection {
    marketInstruments: MarketDataBackupInstrument[]
    priceSnapshots: MarketDataBackupPriceSnapshot[]
}

const INSTRUMENT_TYPES = [
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
] as const

const FRESHNESS_STATUSES = ['UNKNOWN', 'FRESH', 'STALE', 'UNAVAILABLE', 'ERROR'] as const
const SNAPSHOT_SOURCES = ['MANUAL', 'IMPORTED', 'API'] as const

class MarketDataBackupError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'MarketDataBackupError'
    }
}

function fail(message: string): never {
    throw new MarketDataBackupError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) fail(`${path} doit être un objet.`)
    return value
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) fail(`${path} doit être un tableau.`)
    return value
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') fail(`${path} doit être une chaîne.`)
    return value
}

function requireNonEmptyString(value: unknown, path: string): string {
    const normalized = requireString(value, path).trim()
    if (!normalized) fail(`${path} ne peut pas être vide.`)
    return normalized
}

function optionalNullableString(value: unknown, path: string, fallback: string | null = null): string | null {
    if (value == null) return fallback
    return requireString(value, path)
}

function requireIntegerId(value: unknown, path: string): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) fail(`${path} doit être un identifiant entier positif.`)
    return parsed
}

function optionalNullableIntegerId(value: unknown, path: string): number | null {
    if (value == null) return null
    return requireIntegerId(value, path)
}

function optionalNumber(value: unknown, path: string, fallback: number | null = null): number | null {
    if (value == null) return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) fail(`${path} doit être un nombre fini.`)
    return parsed
}

function requirePositiveNumber(value: unknown, path: string): number {
    const parsed = optionalNumber(value, path)
    if (parsed == null || parsed <= 0) fail(`${path} doit être strictement positif.`)
    return parsed
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(`${path} doit être un booléen.`)
    return value
}

function optionalBoolean(value: unknown, path: string, fallback: boolean): boolean {
    if (value == null) return fallback
    return requireBoolean(value, path)
}

function requireIsoDate(value: unknown, path: string): string {
    const raw = requireString(value, path)
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) fail(`${path} doit être une date ISO valide.`)
    return date.toISOString()
}

function optionalNullableIsoDate(value: unknown, path: string, fallback: string | null = null): string | null {
    if (value == null) return fallback
    return requireIsoDate(value, path)
}

function oneOf<T extends readonly string[]>(value: unknown, path: string, allowed: T, fallback: T[number]): T[number] {
    if (value == null) return fallback
    const normalized = requireString(value, path).toUpperCase()
    if (!allowed.includes(normalized)) fail(`${path} contient une valeur non supportée.`)
    return normalized as T[number]
}

function currency(value: unknown, path: string, fallback = 'CAD') {
    return requireNonEmptyString(value ?? fallback, path).toUpperCase()
}

function nullableDateFromRow(row: Record<string, unknown>, key: string, path: string) {
    return optionalNullableIsoDate(row[key], `${path}.${key}`)
}

function normalizeInstrument(value: unknown, index: number): MarketDataBackupInstrument {
    const path = `marketData.marketInstruments[${index}]`
    const row = requireRecord(value, path)
    return {
        id: requireIntegerId(row.id, `${path}.id`),
        instrumentKey: requireNonEmptyString(row.instrumentKey, `${path}.instrumentKey`),
        symbol: requireNonEmptyString(row.symbol, `${path}.symbol`).toUpperCase(),
        name: optionalNullableString(row.name, `${path}.name`),
        instrumentType: oneOf(row.instrumentType, `${path}.instrumentType`, INSTRUMENT_TYPES, 'OTHER'),
        exchange: optionalNullableString(row.exchange, `${path}.exchange`)?.toUpperCase() || null,
        quoteCurrency: currency(row.quoteCurrency, `${path}.quoteCurrency`),
        provider: optionalNullableString(row.provider, `${path}.provider`),
        providerInstrumentId: optionalNullableString(row.providerInstrumentId, `${path}.providerInstrumentId`),
        currentPrice: optionalNumber(row.currentPrice, `${path}.currentPrice`),
        currentPriceCurrency: optionalNullableString(row.currentPriceCurrency, `${path}.currentPriceCurrency`)?.toUpperCase() || null,
        currentPriceQuotedAt: nullableDateFromRow(row, 'currentPriceQuotedAt', path),
        currentPriceProvider: optionalNullableString(row.currentPriceProvider, `${path}.currentPriceProvider`),
        freshnessStatus: oneOf(row.freshnessStatus, `${path}.freshnessStatus`, FRESHNESS_STATUSES, 'UNKNOWN'),
        freshnessCheckedAt: nullableDateFromRow(row, 'freshnessCheckedAt', path),
        staleAfterHours: requireIntegerId(row.staleAfterHours ?? 24, `${path}.staleAfterHours`),
        isActive: optionalBoolean(row.isActive, `${path}.isActive`, true),
        note: optionalNullableString(row.note, `${path}.note`),
    }
}

function normalizeSnapshot(value: unknown, index: number): MarketDataBackupPriceSnapshot {
    const path = `marketData.priceSnapshots[${index}]`
    const row = requireRecord(value, path)
    return {
        id: requireIntegerId(row.id, `${path}.id`),
        marketInstrumentId: optionalNullableIntegerId(row.marketInstrumentId, `${path}.marketInstrumentId`),
        holdingLotId: optionalNullableIntegerId(row.holdingLotId, `${path}.holdingLotId`),
        unitPrice: requirePositiveNumber(row.unitPrice, `${path}.unitPrice`),
        currency: currency(row.currency, `${path}.currency`),
        pricedAt: requireIsoDate(row.pricedAt, `${path}.pricedAt`),
        provider: requireNonEmptyString(row.provider ?? 'manual', `${path}.provider`),
        source: oneOf(row.source, `${path}.source`, SNAPSHOT_SOURCES, 'MANUAL'),
        freshnessStatus: oneOf(row.freshnessStatus, `${path}.freshnessStatus`, FRESHNESS_STATUSES, 'UNKNOWN'),
        retrievedAt: requireIsoDate(row.retrievedAt ?? row.pricedAt, `${path}.retrievedAt`),
        note: optionalNullableString(row.note, `${path}.note`),
    }
}

function ensureUniqueIds(rows: { id: number }[], label: string) {
    const seen = new Set<number>()
    for (const row of rows) {
        if (seen.has(row.id)) fail(`${label} contient un identifiant dupliqué (${row.id}).`)
        seen.add(row.id)
    }
}

function assertMarketDataBackupConsistency(section: MarketDataBackupSection) {
    ensureUniqueIds(section.marketInstruments, 'marketData.marketInstruments')
    ensureUniqueIds(section.priceSnapshots, 'marketData.priceSnapshots')
    const instrumentIds = new Set(section.marketInstruments.map((instrument) => instrument.id))
    const instrumentKeys = new Set<string>()

    for (const instrument of section.marketInstruments) {
        if (instrumentKeys.has(instrument.instrumentKey)) {
            fail(`marketData.marketInstruments contient une clé dupliquée (${instrument.instrumentKey}).`)
        }
        instrumentKeys.add(instrument.instrumentKey)
    }

    for (const snapshot of section.priceSnapshots) {
        if (snapshot.marketInstrumentId != null && !instrumentIds.has(snapshot.marketInstrumentId)) {
            fail(`Snapshot ${snapshot.id} référence un instrument absent (${snapshot.marketInstrumentId}).`)
        }
        if (snapshot.marketInstrumentId == null && snapshot.holdingLotId == null) {
            fail(`Snapshot ${snapshot.id} doit référencer un instrument ou un lot.`)
        }
    }
}

export function parseMarketDataBackupSection(value: unknown): MarketDataBackupSection {
    const root = requireRecord(value, 'marketData')
    const section = {
        marketInstruments: requireArray(root.marketInstruments ?? [], 'marketData.marketInstruments').map(normalizeInstrument),
        priceSnapshots: requireArray(root.priceSnapshots ?? [], 'marketData.priceSnapshots').map(normalizeSnapshot),
    }
    assertMarketDataBackupConsistency(section)
    return section
}

export function createMarketDataBackupSection(
    marketInstruments: Array<Record<string, unknown>> = [],
    priceSnapshots: Array<Record<string, unknown>> = [],
): MarketDataBackupSection {
    return parseMarketDataBackupSection({marketInstruments, priceSnapshots})
}

export {MarketDataBackupError}
