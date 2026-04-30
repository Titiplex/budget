import type {HoldingLot, WealthAsset, WealthPortfolio} from '../types/wealth'

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
  instrumentId?: number | null
  unitPrice: number
  currency?: string | null
  pricedAt?: string | null
  provider?: string | null
  source?: string | null
  freshnessStatus?: string | null
  stalenessStatus?: string | null
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

export type WealthHoldingLotWithMarketInstrument = HoldingLot & {
  marketInstrumentId?: number | null
  marketInstrument?: MarketInstrumentLite | null
}

export interface WealthMarketValuationRow {
  key: string
  entityType: 'asset' | 'portfolio' | 'holdingLot'
  entityId: number
  parentPortfolioId?: number | null
  label: string
  symbol: string | null
  instrumentId: number | null
  source: WealthMarketValuationSource
  status: WealthMarketFreshnessStatus
  /** Compatibility field. UI should translate from `status`, not display this directly. */
  statusLabel: WealthMarketFreshnessStatus
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

function ownershipFactor(record: { ownershipPercent?: number | null } | null | undefined) {
  const percent = Number(record?.ownershipPercent ?? 100)
  if (!Number.isFinite(percent)) return 1
  return Math.max(0, Math.min(100, percent)) / 100
}

function positiveNumber(value: number | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null
}

function manualAssetValue(record: { currentValue?: number | null; ownershipPercent?: number | null }) {
  const amount = positiveNumber(record.currentValue)
  if (amount == null) return null
  return roundMoney(amount * ownershipFactor(record))
}

function manualHoldingValue(holding: HoldingLot, portfolio?: WealthPortfolio | null) {
  const directMarketValue = positiveNumber(holding.marketValue)
  if (directMarketValue != null) return roundMoney(directMarketValue * ownershipFactor(portfolio))

  const unitPrice = positiveNumber(holding.unitPrice)
  const quantity = positiveNumber(holding.quantity)
  if (unitPrice == null || quantity == null) return null
  return roundMoney(unitPrice * quantity * ownershipFactor(portfolio))
}

function isProviderError(error: MarketDataErrorLite | null | undefined, instrument?: MarketInstrumentLite | null) {
  const code = error?.code?.toUpperCase() || ''
  const instrumentStatus = instrument?.freshnessStatus?.toUpperCase()
  return instrumentStatus === 'ERROR'
    || code.includes('PROVIDER')
    || code.includes('RATE_LIMIT')
    || code.includes('TIMEOUT')
    || code.includes('NETWORK')
}

export function getAssetMarketInstrumentId(asset: WealthAssetWithMarketInstrument) {
  const id = Number(asset.marketInstrumentId ?? asset.marketInstrument?.id ?? 0)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function getHoldingMarketInstrumentId(holding: WealthHoldingLotWithMarketInstrument) {
  const id = Number(holding.marketInstrumentId ?? holding.marketInstrument?.id ?? 0)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function getStatusLabel(status: WealthMarketFreshnessStatus) {
  return status
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
  const manual = manualAssetValue(asset)
  const symbol = instrument?.symbol || null

  if (snapshot && Number.isFinite(Number(snapshot.unitPrice)) && Number(snapshot.unitPrice) > 0) {
    const quoteCurrency = normalizeCurrency(snapshot.currency, instrument?.quoteCurrency || wealthCurrency)
    const unitPrice = Number(snapshot.unitPrice)
    const marketValue = roundMoney(unitPrice * ownershipFactor(asset))
    const status = normalizeStatus(snapshot.freshnessStatus || snapshot.stalenessStatus || instrument?.freshnessStatus)

    return {
      key: `asset-${asset.id}`,
      entityType: 'asset',
      entityId: asset.id,
      parentPortfolioId: null,
      label: asset.name,
      symbol,
      instrumentId,
      source: 'MARKET',
      status,
      statusLabel: status,
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
      parentPortfolioId: null,
      label: asset.name,
      symbol,
      instrumentId,
      source: 'MANUAL_FALLBACK',
      status,
      statusLabel: status,
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
    parentPortfolioId: null,
    label: asset.name,
    symbol,
    instrumentId,
    source: 'UNAVAILABLE',
    status,
    statusLabel: status,
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
    errorCode: error?.code || 'NO_LOCAL_DATA',
    errorMessage: error?.message || null,
  }
}

export function createHoldingLotMarketValuationRow({
  holding,
  portfolio = null,
  snapshot = null,
  instrument = null,
  error = null,
  summaryCurrency = 'CAD',
}: {
  holding: WealthHoldingLotWithMarketInstrument
  portfolio?: WealthPortfolio | null
  snapshot?: MarketSnapshotLite | null
  instrument?: MarketInstrumentLite | null
  error?: MarketDataErrorLite | null
  summaryCurrency?: string | null
}): WealthMarketValuationRow {
  const wealthCurrency = normalizeCurrency(holding.currency, normalizeCurrency(portfolio?.currency, normalizeCurrency(summaryCurrency)))
  const instrumentId = getHoldingMarketInstrumentId(holding)
  const quantity = positiveNumber(holding.quantity) ?? 0
  const manual = manualHoldingValue(holding, portfolio)
  const symbol = instrument?.symbol || holding.symbol || null
  const label = portfolio?.name ? `${portfolio.name} · ${holding.name}` : holding.name

  if (snapshot && Number.isFinite(Number(snapshot.unitPrice)) && Number(snapshot.unitPrice) > 0 && quantity > 0) {
    const quoteCurrency = normalizeCurrency(snapshot.currency, instrument?.quoteCurrency || wealthCurrency)
    const unitPrice = Number(snapshot.unitPrice)
    const marketValue = roundMoney(unitPrice * quantity * ownershipFactor(portfolio))
    const status = normalizeStatus(snapshot.freshnessStatus || snapshot.stalenessStatus || instrument?.freshnessStatus)

    return {
      key: `holdingLot-${holding.id}`,
      entityType: 'holdingLot',
      entityId: holding.id,
      parentPortfolioId: portfolio?.id ?? holding.portfolioId ?? null,
      label,
      symbol,
      instrumentId,
      source: 'MARKET',
      status,
      statusLabel: status,
      quantity,
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
      key: `holdingLot-${holding.id}`,
      entityType: 'holdingLot',
      entityId: holding.id,
      parentPortfolioId: portfolio?.id ?? holding.portfolioId ?? null,
      label,
      symbol,
      instrumentId,
      source: 'MANUAL_FALLBACK',
      status,
      statusLabel: status,
      quantity: quantity || null,
      unitPrice: null,
      marketValue: null,
      manualValue: manual,
      valueUsed: manual,
      quoteCurrency: instrument?.quoteCurrency ? normalizeCurrency(instrument.quoteCurrency) : null,
      displayCurrency: wealthCurrency,
      wealthCurrency,
      pricedAt: holding.valueAsOf || portfolio?.valueAsOf || null,
      provider: instrument?.provider || null,
      errorCode: error?.code || null,
      errorMessage: error?.message || null,
    }
  }

  return {
    key: `holdingLot-${holding.id}`,
    entityType: 'holdingLot',
    entityId: holding.id,
    parentPortfolioId: portfolio?.id ?? holding.portfolioId ?? null,
    label,
    symbol,
    instrumentId,
    source: 'UNAVAILABLE',
    status,
    statusLabel: status,
    quantity: quantity || null,
    unitPrice: null,
    marketValue: null,
    manualValue: null,
    valueUsed: null,
    quoteCurrency: instrument?.quoteCurrency ? normalizeCurrency(instrument.quoteCurrency) : null,
    displayCurrency: wealthCurrency,
    wealthCurrency,
    pricedAt: null,
    provider: instrument?.provider || null,
    errorCode: error?.code || 'HOLDING_NO_MANUAL_VALUE',
    errorMessage: error?.message || null,
  }
}

export function createPortfolioManualValuationRow(portfolio: WealthPortfolio): WealthMarketValuationRow {
  const currency = normalizeCurrency(portfolio.currency)
  const manual = manualAssetValue(portfolio)
  const source: WealthMarketValuationSource = manual == null ? 'UNAVAILABLE' : 'MANUAL_FALLBACK'
  const status: WealthMarketFreshnessStatus = manual == null ? 'UNAVAILABLE' : 'UNKNOWN'

  return {
    key: `portfolio-${portfolio.id}`,
    entityType: 'portfolio',
    entityId: portfolio.id,
    parentPortfolioId: portfolio.id,
    label: portfolio.name,
    symbol: null,
    instrumentId: null,
    source,
    status,
    statusLabel: status,
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
    errorCode: source === 'UNAVAILABLE' ? 'PORTFOLIO_NO_MANUAL_VALUE' : null,
    errorMessage: null,
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
