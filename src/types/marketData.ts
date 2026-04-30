/**
 * Shared renderer/main contracts for market data.
 *
 * This module intentionally stays independent from external provider payloads and
 * from the existing wealth-domain PriceSnapshot type. Use the prefixed aliases
 * when a file also imports wealth contracts.
 */
export type MarketDataId = number
export type MarketDataDateString = string
export type MarketDataDateTimeString = string
export type MarketDataCurrencyCode = string
export type MarketDataProviderId = string
export type MarketDataSymbol = string

export type MarketInstrumentType =
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
export type StalenessStatus = 'MISSING' | 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN'
export type MarketDataStalenessStatus = StalenessStatus

export type ProviderErrorStatus =
    | 'UNKNOWN_SYMBOL'
    | 'RATE_LIMITED'
    | 'PROVIDER_UNAVAILABLE'
    | 'UNSUPPORTED_CURRENCY'
    | 'INVALID_RESPONSE'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'UNKNOWN_ERROR'

export type MarketDataProviderErrorStatus = ProviderErrorStatus

export type MarketValuationMode =
    | 'MANUAL'
    | 'LATEST_PRICE'
    | 'LATEST_FRESH_PRICE'
    | 'HISTORICAL_PRICE'
    | 'PROVIDER_QUOTE'
    | 'FALLBACK_MANUAL'

export type MarketDataRefreshStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SKIPPED'
export type MarketPriceSnapshotSource = 'MANUAL' | 'IMPORTED' | 'PROVIDER'
export type MarketDataTimeGranularity = 'REAL_TIME' | 'DELAYED' | 'END_OF_DAY' | 'HISTORICAL' | 'UNKNOWN'

export const MARKET_INSTRUMENT_TYPES = [
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
] as const satisfies readonly MarketInstrumentType[]

export const MARKET_DATA_STALENESS_STATUSES = [
    'MISSING',
    'FRESH',
    'STALE',
    'EXPIRED',
    'UNKNOWN',
] as const satisfies readonly StalenessStatus[]

export const MARKET_DATA_PROVIDER_ERROR_STATUSES = [
    'UNKNOWN_SYMBOL',
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
    'UNSUPPORTED_CURRENCY',
    'INVALID_RESPONSE',
    'NETWORK_ERROR',
    'TIMEOUT',
    'UNKNOWN_ERROR',
] as const satisfies readonly ProviderErrorStatus[]

export const MARKET_VALUATION_MODES = [
    'MANUAL',
    'LATEST_PRICE',
    'LATEST_FRESH_PRICE',
    'HISTORICAL_PRICE',
    'PROVIDER_QUOTE',
    'FALLBACK_MANUAL',
] as const satisfies readonly MarketValuationMode[]

export const MARKET_PRICE_SNAPSHOT_SOURCES = [
    'MANUAL',
    'IMPORTED',
    'PROVIDER',
] as const satisfies readonly MarketPriceSnapshotSource[]

export const MARKET_DATA_TIME_GRANULARITIES = [
    'REAL_TIME',
    'DELAYED',
    'END_OF_DAY',
    'HISTORICAL',
    'UNKNOWN',
] as const satisfies readonly MarketDataTimeGranularity[]

export const MARKET_INSTRUMENT_TYPE_LABELS: Record<MarketInstrumentType, string> = {
    EQUITY: 'wealth.market.instrumentTypes.EQUITY',
    ETF: 'wealth.market.instrumentTypes.ETF',
    MUTUAL_FUND: 'wealth.market.instrumentTypes.MUTUAL_FUND',
    BOND: 'wealth.market.instrumentTypes.BOND',
    CRYPTO: 'wealth.market.instrumentTypes.CRYPTO',
    OPTION: 'wealth.market.instrumentTypes.OPTION',
    COMMODITY: 'wealth.market.instrumentTypes.COMMODITY',
    FOREX: 'wealth.market.instrumentTypes.FOREX',
    INDEX: 'wealth.market.instrumentTypes.INDEX',
    FUND: 'wealth.market.instrumentTypes.FUND',
    OTHER: 'wealth.market.instrumentTypes.OTHER',
}

export const MARKET_DATA_STALENESS_STATUS_LABELS: Record<StalenessStatus, string> = {
    MISSING: 'wealth.market.freshnessLabels.MISSING',
    FRESH: 'wealth.market.freshnessLabels.FRESH',
    STALE: 'wealth.market.freshnessLabels.STALE',
    EXPIRED: 'wealth.market.freshnessLabels.EXPIRED',
    UNKNOWN: 'wealth.market.freshnessLabels.UNKNOWN',
}

export const MARKET_DATA_PROVIDER_ERROR_STATUS_LABELS: Record<ProviderErrorStatus, string> = {
    UNKNOWN_SYMBOL: 'wealth.market.providerErrors.UNKNOWN_SYMBOL',
    RATE_LIMITED: 'wealth.market.providerErrors.RATE_LIMITED',
    PROVIDER_UNAVAILABLE: 'wealth.market.providerErrors.PROVIDER_UNAVAILABLE',
    UNSUPPORTED_CURRENCY: 'wealth.market.providerErrors.UNSUPPORTED_CURRENCY',
    INVALID_RESPONSE: 'wealth.market.providerErrors.INVALID_RESPONSE',
    NETWORK_ERROR: 'wealth.market.providerErrors.NETWORK_ERROR',
    TIMEOUT: 'wealth.market.providerErrors.TIMEOUT',
    UNKNOWN_ERROR: 'wealth.market.providerErrors.UNKNOWN_ERROR',
}

export const MARKET_VALUATION_MODE_LABELS: Record<MarketValuationMode, string> = {
    MANUAL: 'wealth.market.valuationModes.MANUAL',
    LATEST_PRICE: 'wealth.market.valuationModes.LATEST_PRICE',
    LATEST_FRESH_PRICE: 'wealth.market.valuationModes.LATEST_FRESH_PRICE',
    HISTORICAL_PRICE: 'wealth.market.valuationModes.HISTORICAL_PRICE',
    PROVIDER_QUOTE: 'wealth.market.valuationModes.PROVIDER_QUOTE',
    FALLBACK_MANUAL: 'wealth.market.valuationModes.FALLBACK_MANUAL',
}

export interface MarketDataProviderRateLimit {
    requests: number
    interval: 'SECOND' | 'MINUTE' | 'HOUR' | 'DAY'
    burst?: number | null
}

export interface MarketDataProvider {
    id: MarketDataProviderId
    name: string
    enabled: boolean
    supportsSearch: boolean
    supportsBatchQuotes: boolean
    supportsHistoricalQuotes: boolean
    supportedInstrumentTypes: MarketInstrumentType[]
    supportedCurrencies: MarketDataCurrencyCode[] | null
    priority: number
    rateLimit: MarketDataProviderRateLimit | null
}

export interface MarketInstrumentIdentifiers {
    isin: string | null
    cusip: string | null
    figi: string | null
}

export interface MarketInstrument {
    id: MarketDataId
    symbol: MarketDataSymbol
    name: string
    type: MarketInstrumentType
    currency: MarketDataCurrencyCode
    exchangeCode: string | null
    exchangeName: string | null
    identifiers: MarketInstrumentIdentifiers
    providerSymbols: Record<MarketDataProviderId, MarketDataSymbol>
    isActive: boolean
    note: string | null
    createdAt: MarketDataDateTimeString
    updatedAt: MarketDataDateTimeString
}

export interface MarketPriceSnapshot {
    id: MarketDataId
    instrumentId: MarketDataId
    providerId: MarketDataProviderId | null
    symbol: MarketDataSymbol
    unitPrice: number
    currency: MarketDataCurrencyCode
    pricedAt: MarketDataDateTimeString
    retrievedAt: MarketDataDateTimeString | null
    source: MarketPriceSnapshotSource
    stalenessStatus: StalenessStatus
    timeGranularity: MarketDataTimeGranularity
    note: string | null
    createdAt: MarketDataDateTimeString
    updatedAt: MarketDataDateTimeString
}

/**
 * Compatibility alias requested by the market-data issue.
 * Prefer MarketPriceSnapshot in files that also import wealth.PriceSnapshot.
 */
export type PriceSnapshot = MarketPriceSnapshot

export interface MarketDataProviderError {
    status: ProviderErrorStatus
    message: string
    providerId: MarketDataProviderId | null
    symbol: MarketDataSymbol | null
    instrumentId: MarketDataId | null
    retryAfterSeconds: number | null
    recoverable: boolean
}

export interface MarketDataQuote {
    providerId: MarketDataProviderId
    instrumentId: MarketDataId | null
    symbol: MarketDataSymbol
    unitPrice: number
    currency: MarketDataCurrencyCode
    pricedAt: MarketDataDateTimeString
    retrievedAt: MarketDataDateTimeString
    stalenessStatus: StalenessStatus
    timeGranularity: MarketDataTimeGranularity
    previousClose: number | null
    change: number | null
    changePercent: number | null
}

export interface MarketDataRefreshSummary {
    requested: number
    succeeded: number
    failed: number
    skipped: number
    stale: number
    missing: number
}

export interface MarketDataRefreshResult {
    status: MarketDataRefreshStatus
    providerId: MarketDataProviderId | null
    requestedAt: MarketDataDateTimeString
    completedAt: MarketDataDateTimeString
    requestedSymbols: MarketDataSymbol[]
    quotes: MarketDataQuote[]
    snapshots: MarketPriceSnapshot[]
    errors: MarketDataProviderError[]
    summary: MarketDataRefreshSummary
}

export interface WatchlistItem {
    id: MarketDataId
    instrumentId: MarketDataId
    instrument?: MarketInstrument | null
    targetCurrency: MarketDataCurrencyCode | null
    displayOrder: number
    lastSnapshot: MarketPriceSnapshot | null
    stalenessStatus: StalenessStatus
    note: string | null
    createdAt: MarketDataDateTimeString
    updatedAt: MarketDataDateTimeString
}

export type ValuationEntityType = 'asset' | 'portfolio' | 'holdingLot' | 'watchlistItem'

export interface ValuationResult {
    entityType: ValuationEntityType
    entityId: MarketDataId | null
    instrumentId: MarketDataId | null
    quantity: number
    currency: MarketDataCurrencyCode
    mode: MarketValuationMode
    unitPrice: number | null
    marketValue: number | null
    valueAsOf: MarketDataDateTimeString | null
    stalenessStatus: StalenessStatus
    usedSnapshot: MarketPriceSnapshot | null
    error: MarketDataProviderError | null
    warnings: string[]
}

export interface CreateMarketInstrumentPayload {
    symbol: MarketDataSymbol
    name: string
    type: MarketInstrumentType
    currency: MarketDataCurrencyCode
    exchangeCode?: string | null
    exchangeName?: string | null
    identifiers?: Partial<MarketInstrumentIdentifiers> | null
    providerSymbols?: Record<MarketDataProviderId, MarketDataSymbol>
    isActive?: boolean
    note?: string | null
}

export type UpdateMarketInstrumentPayload = Partial<CreateMarketInstrumentPayload>

export interface CreatePriceSnapshotPayload {
    instrumentId: MarketDataId
    providerId?: MarketDataProviderId | null
    symbol: MarketDataSymbol
    unitPrice: number
    currency: MarketDataCurrencyCode
    pricedAt: MarketDataDateTimeString
    retrievedAt?: MarketDataDateTimeString | null
    source: MarketPriceSnapshotSource
    stalenessStatus?: StalenessStatus
    timeGranularity?: MarketDataTimeGranularity
    note?: string | null
}

export type UpdatePriceSnapshotPayload = Partial<CreatePriceSnapshotPayload>
export type CreateMarketPriceSnapshotPayload = CreatePriceSnapshotPayload
export type UpdateMarketPriceSnapshotPayload = UpdatePriceSnapshotPayload

export interface CreateWatchlistItemPayload {
    instrumentId: MarketDataId
    targetCurrency?: MarketDataCurrencyCode | null
    displayOrder?: number
    note?: string | null
}

export type UpdateWatchlistItemPayload = Partial<CreateWatchlistItemPayload>

export interface MarketDataQuoteRequest {
    providerId?: MarketDataProviderId | null
    instrumentId?: MarketDataId | null
    symbol: MarketDataSymbol
    currency?: MarketDataCurrencyCode | null
    pricedAt?: MarketDataDateString | MarketDataDateTimeString | null
}

export interface MarketDataRefreshRequest {
    providerId?: MarketDataProviderId | null
    instruments: MarketDataQuoteRequest[]
    force?: boolean
    maxStalenessMinutes?: number | null
}

export interface ValuationRequest {
    entityType: ValuationEntityType
    entityId?: MarketDataId | null
    instrumentId?: MarketDataId | null
    symbol?: MarketDataSymbol | null
    quantity: number
    currency: MarketDataCurrencyCode
    mode: MarketValuationMode
    asOf?: MarketDataDateString | MarketDataDateTimeString | null
    fallbackUnitPrice?: number | null
}

export function isMarketDataStalenessStatus(value: string): value is StalenessStatus {
    return MARKET_DATA_STALENESS_STATUSES.includes(value as StalenessStatus)
}

export function isMarketDataProviderErrorStatus(value: string): value is ProviderErrorStatus {
    return MARKET_DATA_PROVIDER_ERROR_STATUSES.includes(value as ProviderErrorStatus)
}

export function hasUsableMarketPrice(status: StalenessStatus): boolean {
    return status === 'FRESH' || status === 'STALE' || status === 'EXPIRED'
}

export function isFreshMarketData(status: StalenessStatus): boolean {
    return status === 'FRESH'
}
