export type MarketFreshnessStatus = 'UNKNOWN' | 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'ERROR'
export type MarketStalenessStatus = 'MISSING' | 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN'

export interface MarketPriceSnapshotDto {
    id: number
    instrumentId: number | null
    providerId: string | null
    symbol: string | null
    unitPrice: number
    currency: string
    pricedAt: string | null
    retrievedAt: string | null
    source: string
    stalenessStatus: MarketStalenessStatus
    freshnessStatus: MarketFreshnessStatus
    timeGranularity: string
    note: string | null
    createdAt: string | null
    updatedAt: string | null
}

export interface MarketInstrumentDto {
    id: number
    instrumentKey: string
    symbol: string
    name: string | null
    type: string
    instrumentType: string
    currency: string
    quoteCurrency: string
    exchangeCode: string | null
    exchangeName: string | null
    exchange: string | null
    provider: string | null
    isActive: boolean
    currentPrice: number | null
    currentPriceCurrency: string | null
    currentPriceQuotedAt: string | null
    currentPriceProvider: string | null
    freshnessStatus: MarketFreshnessStatus
    staleAfterHours: number
    note: string | null
    createdAt: string | null
    updatedAt: string | null
}

export interface MarketWatchlistItem {
    id: number
    instrumentId: number
    targetCurrency: string | null
    displayOrder: number
    stalenessStatus: MarketStalenessStatus
    freshnessStatus: MarketFreshnessStatus
    note: string | null
    createdAt: string | null
    updatedAt: string | null
    lastSnapshot: MarketPriceSnapshotDto | null
    instrument: MarketInstrumentDto | null
}

export interface MarketWatchlistForm {
    symbol: string
    name: string
    currency: string
    exchange: string
    provider: string
    instrumentType: string
}

export interface CreateMarketWatchlistInstrumentInput {
    symbol: string
    name?: string | null
    currency: string
    exchange?: string | null
    provider?: string | null
    instrumentType?: string | null
}

export interface MarketProviderErrorDto {
    status: string
    message: string
    providerId: string | null
    symbol: string | null
    instrumentId: number | null
    retryAfterSeconds: number | null
    recoverable: boolean
}

export interface MarketRefreshSummaryDto {
    requested: number
    succeeded: number
    failed: number
    skipped: number
    stale: number
    missing: number
}

export interface MarketDataRefreshResult {
    status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SKIPPED'
    providerId: string | null
    requestedAt: string
    completedAt: string
    requestedSymbols: string[]
    quotes: Array<{
        providerId: string
        instrumentId: number
        symbol: string
        unitPrice: number
        currency: string
        pricedAt: string
        retrievedAt: string
        stalenessStatus: MarketStalenessStatus
        freshnessStatus: MarketFreshnessStatus
        timeGranularity: string
        previousClose: number | null
        change: number | null
        changePercent: number | null
    }>
    snapshots: MarketPriceSnapshotDto[]
    errors: MarketProviderErrorDto[]
    summary: MarketRefreshSummaryDto
}

export interface MarketDataIpcErrorDto {
    code: string
    message: string
    details: unknown | null
}

export interface MarketDataIpcResult<T> {
    ok: boolean
    data: T | null
    error: MarketDataIpcErrorDto | null
}

export type MarketDataMaybeIpcResult<T> = T | MarketDataIpcResult<T>

export interface MarketDataRendererApi {
    listWatchlist(options?: { search?: string | null }): Promise<MarketDataMaybeIpcResult<MarketWatchlistItem[]>>

    addWatchlistInstrument(input: CreateMarketWatchlistInstrumentInput): Promise<MarketDataMaybeIpcResult<MarketWatchlistItem>>

    removeWatchlistInstrument(id: number): Promise<MarketDataMaybeIpcResult<{
        ok: boolean;
        id: number;
        entityType: 'watchlistItem'
    }>>

    refreshWatchlist(options?: {
        instrumentIds?: number[];
        providerId?: string | null
    }): Promise<MarketDataMaybeIpcResult<MarketDataRefreshResult>>
}
