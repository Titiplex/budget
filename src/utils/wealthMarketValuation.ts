import type {WealthAsset, WealthPortfolio} from '../types/wealth'

export type WealthMarketFreshnessStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'ERROR' | 'UNKNOWN'

export type WealthMarketValuationSource = 'MARKET' | 'MANUAL_FALLBACK' | 'UNAVAILABLE'

export interface MarketInstrumentLite {
    id: number
    symbol?: string | null
    name?: string | null
    quoteCurrency?: string | null
    provider?: string | null
    currentPrice?: number | null
    currentPriceCurrency?: string | null
    currentPriceQuotedAt?: string | null
    currentPriceProvider?: string | null
    freshnessStatus?: string | null
}

export interface MarketSnapshotLite {
    id: number
    marketInstrumentId?: number | null
    unitPrice: number
    currency?: string | null
    pricedAt?: string | null
    provider?: string | null
    source?: string | null
    freshnessStatus?: string | null
    retrievedAt?: string | null
}

export interface MarketDataErrorLite {
    code?: string | null
    message?: string | null
    details?: unknown
}

export type WealthAssetWithMarketInstrument = WealthAsset & {
    marketInstrumentId?: number | null
    marketInstrument?: MarketInstrumentLite | null
}

export interface WealthMarketValuationRow {
    key: string
    entityType: 'asset' | 'portfolio'
    entityId: number
    label: string
    symbol: string | null
    instrumentId: number | null
    source: WealthMarketValuationSource
    status: WealthMarketFreshnessStatus
    statusLabel: string
    quantity: number | null
    unitPrice: number | null
    marketValue: number | null
    manualValue: number | null
    valueUsed: number | null
    quoteCurrency: string | null
    displayCurrency: string
    wealthCurrency: string
    pricedAt: string | null
    provider: string | null
    errorCode: string | null
    errorMessage: string | null
}

export interface WealthMarketValuationSummary {
    currency: string
    totalMarketValue: number
    totalManualFallbackValue: number
    totalUnavailableCount: number
    totalErrorCount: number
    totalRows: number
    totalValuedRows: number
    ignoredCurrencyCount: number
    netWorthSafeContribution: number
}

const STATUS_LABELS: Record<WealthMarketFreshnessStatus, string> = {
    FRESH: 'Donnée fraîche',
    STALE: 'Donnée stale',
    UNAVAILABLE: 'Donnée absente',
    ERROR: 'Provider en erreur',
    UNKNOWN: 'Fraîcheur inconnue',
}

function normalizeCurrency(value: string | null | undefined, fallback = 'CAD') {
    return value?.trim().toUpperCase() || fallback
}

function normalizeStatus(value: string | null | undefined): WealthMarketFreshnessStatus {
    const normalized = value?.trim().toUpperCase()
    if (normalized === 'FRESH' || normalized === 'STALE' || normalized === 'UNAVAILABLE' || normalized === 'ERROR') {
        return normalized
    }
    if (normalized === 'MISSING' || normalized === 'EXPIRED') return 'UNAVAILABLE'
    return 'UNKNOWN'
}

function roundMoney(value: number) {
    return Math.round(value * 100) / 100
}

function ownershipFactor(record: { ownershipPercent?: number | null }) {
    const percent = Number(record.ownershipPercent ?? 100)
    if (!Number.isFinite(percent)) return 1
    return Math.max(0, Math.min(100, percent)) / 100
}

function manualValue(record: { currentValue?: number | null; ownershipPercent?: number | null }) {
    const amount = Number(record.currentValue ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return roundMoney(amount * ownershipFactor(record))
}

function isProviderError(error: MarketDataErrorLite | null | undefined, instrument?: MarketInstrumentLite | null) {
    const code = error?.code?.toUpperCase() || ''
    const instrumentStatus = instrument?.freshnessStatus?.toUpperCase()
    return instrumentStatus === 'ERROR' || code.includes('PROVIDER') || code.includes('RATE_LIMIT') || code.includes('TIMEOUT') || code.includes('NETWORK')
}

export function getAssetMarketInstrumentId(asset: WealthAssetWithMarketInstrument) {
    const id = Number(asset.marketInstrumentId ?? asset.marketInstrument?.id ?? 0)
    return Number.isInteger(id) && id > 0 ? id : null
}

export function getStatusLabel(status: WealthMarketFreshnessStatus) {
    return STATUS_LABELS[status] || STATUS_LABELS.UNKNOWN
}

export function createWealthAssetValuationRow({
                                                  asset,
                                                  snapshot = null,
                                                  instrument = null,
                                                  error = null,
                                                  summaryCurrency = 'CAD',
                                              }: {
    asset: WealthAssetWithMarketInstrument
    snapshot?: MarketSnapshotLite | null
    instrument?: MarketInstrumentLite | null
    error?: MarketDataErrorLite | null
    summaryCurrency?: string | null
}): WealthMarketValuationRow {
    const wealthCurrency = normalizeCurrency(asset.currency, normalizeCurrency(summaryCurrency))
    const instrumentId = getAssetMarketInstrumentId(asset)
    const manual = manualValue(asset)
    const symbol = instrument?.symbol || null

    if (snapshot && Number.isFinite(Number(snapshot.unitPrice)) && Number(snapshot.unitPrice) > 0) {
        const quoteCurrency = normalizeCurrency(snapshot.currency, instrument?.quoteCurrency || wealthCurrency)
        const unitPrice = Number(snapshot.unitPrice)
        const marketValue = roundMoney(unitPrice * ownershipFactor(asset))
        const status = normalizeStatus(snapshot.freshnessStatus || instrument?.freshnessStatus)

        return {
            key: `asset-${asset.id}`,
            entityType: 'asset',
            entityId: asset.id,
            label: asset.name,
            symbol,
            instrumentId,
            source: 'MARKET',
            status,
            statusLabel: getStatusLabel(status),
            quantity: 1,
            unitPrice,
            marketValue,
            manualValue: manual,
            valueUsed: marketValue,
            quoteCurrency,
            displayCurrency: quoteCurrency,
            wealthCurrency,
            pricedAt: snapshot.pricedAt || null,
            provider: snapshot.provider || instrument?.currentPriceProvider || instrument?.provider || null,
            errorCode: null,
            errorMessage: null,
        }
    }

    const status: WealthMarketFreshnessStatus = isProviderError(error, instrument) ? 'ERROR' : 'UNAVAILABLE'

    if (manual != null) {
        return {
            key: `asset-${asset.id}`,
            entityType: 'asset',
            entityId: asset.id,
            label: asset.name,
            symbol,
            instrumentId,
            source: 'MANUAL_FALLBACK',
            status,
            statusLabel: getStatusLabel(status),
            quantity: instrumentId ? 1 : null,
            unitPrice: null,
            marketValue: null,
            manualValue: manual,
            valueUsed: manual,
            quoteCurrency: instrument?.quoteCurrency ? normalizeCurrency(instrument.quoteCurrency) : null,
            displayCurrency: wealthCurrency,
            wealthCurrency,
            pricedAt: asset.valueAsOf || null,
            provider: instrument?.provider || null,
            errorCode: error?.code || null,
            errorMessage: error?.message || null,
        }
    }

    return {
        key: `asset-${asset.id}`,
        entityType: 'asset',
        entityId: asset.id,
        label: asset.name,
        symbol,
        instrumentId,
        source: 'UNAVAILABLE',
        status,
        statusLabel: getStatusLabel(status),
        quantity: instrumentId ? 1 : null,
        unitPrice: null,
        marketValue: null,
        manualValue: null,
        valueUsed: null,
        quoteCurrency: instrument?.quoteCurrency ? normalizeCurrency(instrument.quoteCurrency) : null,
        displayCurrency: wealthCurrency,
        wealthCurrency,
        pricedAt: null,
        provider: instrument?.provider || null,
        errorCode: error?.code || null,
        errorMessage: error?.message || 'Aucun snapshot local ni fallback manuel disponible.',
    }
}

export function createPortfolioManualValuationRow(portfolio: WealthPortfolio): WealthMarketValuationRow {
    const currency = normalizeCurrency(portfolio.currency)
    const manual = manualValue(portfolio)
    const source: WealthMarketValuationSource = manual == null ? 'UNAVAILABLE' : 'MANUAL_FALLBACK'
    const status: WealthMarketFreshnessStatus = manual == null ? 'UNAVAILABLE' : 'UNKNOWN'

    return {
        key: `portfolio-${portfolio.id}`,
        entityType: 'portfolio',
        entityId: portfolio.id,
        label: portfolio.name,
        symbol: null,
        instrumentId: null,
        source,
        status,
        statusLabel: getStatusLabel(status),
        quantity: null,
        unitPrice: null,
        marketValue: null,
        manualValue: manual,
        valueUsed: manual,
        quoteCurrency: null,
        displayCurrency: currency,
        wealthCurrency: currency,
        pricedAt: portfolio.valueAsOf || null,
        provider: null,
        errorCode: source === 'UNAVAILABLE' ? 'NO_LOCAL_DATA' : null,
        errorMessage: source === 'UNAVAILABLE' ? 'Aucune valeur manuelle disponible pour ce portefeuille.' : null,
    }
}

export function summarizeWealthMarketValuations(
    rows: WealthMarketValuationRow[],
    currency = 'CAD',
): WealthMarketValuationSummary {
    const selectedCurrency = normalizeCurrency(currency)
    const selectedRows = rows.filter((row) => normalizeCurrency(row.displayCurrency) === selectedCurrency)

    return {
        currency: selectedCurrency,
        totalMarketValue: roundMoney(
            selectedRows
                .filter((row) => row.source === 'MARKET')
                .reduce((sum, row) => sum + Number(row.valueUsed || 0), 0),
        ),
        totalManualFallbackValue: roundMoney(
            selectedRows
                .filter((row) => row.source === 'MANUAL_FALLBACK')
                .reduce((sum, row) => sum + Number(row.valueUsed || 0), 0),
        ),
        totalUnavailableCount: selectedRows.filter((row) => row.source === 'UNAVAILABLE').length,
        totalErrorCount: selectedRows.filter((row) => row.status === 'ERROR').length,
        totalRows: rows.length,
        totalValuedRows: selectedRows.filter((row) => row.valueUsed != null).length,
        ignoredCurrencyCount: rows.length - selectedRows.length,
        netWorthSafeContribution: roundMoney(selectedRows.reduce((sum, row) => sum + Number(row.valueUsed || 0), 0)),
    }
}
