/**
 * Shared renderer/main contracts for portfolio analytics.
 *
 * Keep this module pure: no Prisma models, no Electron APIs, no provider payloads
 * and no Vue dependencies. Backend services can map database rows into these
 * contracts, then the renderer can consume the same shapes for the MVP dashboard.
 */
export type PortfolioId = number
export type PortfolioDateString = string
export type PortfolioDateTimeString = string
export type PortfolioCurrencyCode = string
export type PortfolioAccountId = PortfolioId
export type PortfolioAssetId = PortfolioId

export type PortfolioAssetClass =
    | 'cash'
    | 'equity'
    | 'etf'
    | 'fund'
    | 'bond'
    | 'crypto'
    | 'real_estate'
    | 'commodity'
    | 'forex'
    | 'other'

export type PortfolioMovementType =
    | 'buy'
    | 'sell'
    | 'deposit'
    | 'withdrawal'
    | 'dividend'
    | 'interest'
    | 'fee'
    | 'tax'
    | 'transfer_in'
    | 'transfer_out'
    | 'split'
    | 'fx_adjustment'
    | 'manual_adjustment'

export type PortfolioValuationStatus = 'market' | 'manual' | 'stale' | 'missing' | 'error'
export type PortfolioGroupingKey = 'asset' | 'account' | 'assetClass' | 'sector' | 'geography' | 'currency'
export type PortfolioIncomeType = 'dividend' | 'interest' | 'distribution' | 'staking' | 'rent' | 'other'
export type PortfolioFeeType = 'brokerage' | 'management' | 'custody' | 'fx' | 'tax' | 'other'

export const PORTFOLIO_ASSET_CLASSES = [
    'cash',
    'equity',
    'etf',
    'fund',
    'bond',
    'crypto',
    'real_estate',
    'commodity',
    'forex',
    'other',
] as const satisfies readonly PortfolioAssetClass[]

export const PORTFOLIO_MOVEMENT_TYPES = [
    'buy',
    'sell',
    'deposit',
    'withdrawal',
    'dividend',
    'interest',
    'fee',
    'tax',
    'transfer_in',
    'transfer_out',
    'split',
    'fx_adjustment',
    'manual_adjustment',
] as const satisfies readonly PortfolioMovementType[]

export const PORTFOLIO_VALUATION_STATUSES = [
    'market',
    'manual',
    'stale',
    'missing',
    'error',
] as const satisfies readonly PortfolioValuationStatus[]

export const PORTFOLIO_GROUPING_KEYS = [
    'asset',
    'account',
    'assetClass',
    'sector',
    'geography',
    'currency',
] as const satisfies readonly PortfolioGroupingKey[]

export const PORTFOLIO_INCOME_TYPES = [
    'dividend',
    'interest',
    'distribution',
    'staking',
    'rent',
    'other',
] as const satisfies readonly PortfolioIncomeType[]

export const PORTFOLIO_FEE_TYPES = [
    'brokerage',
    'management',
    'custody',
    'fx',
    'tax',
    'other',
] as const satisfies readonly PortfolioFeeType[]

export const PORTFOLIO_VALUATION_STATUS_LABELS: Record<PortfolioValuationStatus, string> = {
    market: 'wealth.portfolio.valuationStatuses.market',
    manual: 'wealth.portfolio.valuationStatuses.manual',
    stale: 'wealth.portfolio.valuationStatuses.stale',
    missing: 'wealth.portfolio.valuationStatuses.missing',
    error: 'wealth.portfolio.valuationStatuses.error',
}

export const PORTFOLIO_GROUPING_KEY_LABELS: Record<PortfolioGroupingKey, string> = {
    asset: 'wealth.portfolio.grouping.asset',
    account: 'wealth.portfolio.grouping.account',
    assetClass: 'wealth.portfolio.grouping.assetClass',
    sector: 'wealth.portfolio.grouping.sector',
    geography: 'wealth.portfolio.grouping.geography',
    currency: 'wealth.portfolio.grouping.currency',
}

export interface PortfolioAsset {
    id: PortfolioAssetId
    symbol: string | null
    name: string
    assetClass: PortfolioAssetClass
    sector: string | null
    geography: string | null
    currency: PortfolioCurrencyCode
    marketInstrumentId: PortfolioId | null
    isActive: boolean
    note: string | null
}

export interface PortfolioPosition {
    id: PortfolioId
    accountId: PortfolioAccountId
    accountName: string
    assetId: PortfolioAssetId
    asset: PortfolioAsset | null
    quantity: number
    averageCost: number | null
    bookValue: number | null
    marketValue: number | null
    currency: PortfolioCurrencyCode
    valuationStatus: PortfolioValuationStatus
    valuedAt: PortfolioDateTimeString | null
    allocationPercent: number
    unrealizedGainLoss: PortfolioGainLoss | null
}

export interface PortfolioMovement {
    id: PortfolioId
    accountId: PortfolioAccountId
    assetId: PortfolioAssetId | null
    type: PortfolioMovementType
    quantity: number | null
    unitPrice: number | null
    grossAmount: number
    feeAmount: number
    taxAmount: number
    netAmount: number
    currency: PortfolioCurrencyCode
    tradeDate: PortfolioDateString
    settledAt: PortfolioDateString | null
    note: string | null
}

export interface PortfolioValuation {
    assetId: PortfolioAssetId | null
    accountId: PortfolioAccountId | null
    quantity: number
    unitPrice: number | null
    marketValue: number | null
    bookValue: number | null
    currency: PortfolioCurrencyCode
    status: PortfolioValuationStatus
    valuedAt: PortfolioDateTimeString | null
    source: 'market_data' | 'manual' | 'imported' | 'derived' | 'none'
    warnings: string[]
}

export interface PortfolioGainLoss {
    absolute: number
    percent: number | null
    currency: PortfolioCurrencyCode
    realized: boolean
}

export interface PortfolioAllocation {
    groupBy: PortfolioGroupingKey
    key: string
    label: string
    marketValue: number
    currency: PortfolioCurrencyCode
    allocationPercent: number
    positionsCount: number
}

export interface PortfolioIncome {
    id: PortfolioId
    accountId: PortfolioAccountId
    assetId: PortfolioAssetId | null
    type: PortfolioIncomeType
    amount: number
    currency: PortfolioCurrencyCode
    paidAt: PortfolioDateString
    withholdingTaxAmount: number
    note: string | null
}

export interface PortfolioFee {
    id: PortfolioId
    accountId: PortfolioAccountId
    assetId: PortfolioAssetId | null
    type: PortfolioFeeType
    amount: number
    currency: PortfolioCurrencyCode
    chargedAt: PortfolioDateString
    note: string | null
}

export interface PortfolioSnapshot {
    id: PortfolioId
    baseCurrency: PortfolioCurrencyCode
    capturedAt: PortfolioDateTimeString
    totalMarketValue: number
    totalBookValue: number
    totalGainLoss: PortfolioGainLoss
    positions: PortfolioPosition[]
    allocations: PortfolioAllocation[]
    income: PortfolioIncome[]
    fees: PortfolioFee[]
    valuationStatus: PortfolioValuationStatus
    warnings: string[]
}

export interface PortfolioAllocationInput {
    key: string
    label?: string | null
    marketValue: number
    currency?: PortfolioCurrencyCode | null
    positionsCount?: number
}

export interface PortfolioAllocationPercentageResult extends Required<Omit<PortfolioAllocationInput, 'currency'>> {
    currency: PortfolioCurrencyCode
    allocationPercent: number
}

export interface PortfolioAggregateResult<TItem> {
    key: string
    items: TItem[]
    count: number
    total: number
}

export function normalizePortfolioCurrency(
    currency: string | null | undefined,
    fallback: PortfolioCurrencyCode = 'CAD',
): PortfolioCurrencyCode {
    const normalized = String(currency || '')
        .trim()
        .toUpperCase()

    return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback.trim().toUpperCase()
}

export function roundPortfolioMoney(amount: number | null | undefined, precision = 2): number {
    if (!Number.isFinite(amount)) return 0

    const safePrecision = Number.isInteger(precision) ? Math.min(Math.max(precision, 0), 8) : 2
    const factor = 10 ** safePrecision

    return Math.round((Number(amount) + Number.EPSILON) * factor) / factor
}

export function calculatePortfolioGainLoss(
    marketValue: number | null | undefined,
    bookValue: number | null | undefined,
    currency: PortfolioCurrencyCode,
    realized = false,
): PortfolioGainLoss {
    const safeMarketValue = Number.isFinite(marketValue) ? Number(marketValue) : 0
    const safeBookValue = Number.isFinite(bookValue) ? Number(bookValue) : 0
    const absolute = roundPortfolioMoney(safeMarketValue - safeBookValue)

    return {
        absolute,
        percent: safeBookValue === 0 ? null : roundPortfolioMoney((absolute / safeBookValue) * 100, 4),
        currency: normalizePortfolioCurrency(currency),
        realized,
    }
}

export function calculatePortfolioAllocationPercentages(
    items: PortfolioAllocationInput[],
    baseCurrency: PortfolioCurrencyCode = 'CAD',
    explicitTotal?: number | null,
): PortfolioAllocationPercentageResult[] {
    const total = Number.isFinite(explicitTotal)
        ? Number(explicitTotal)
        : items.reduce((sum, item) => sum + Math.max(0, item.marketValue || 0), 0)

    return items.map((item) => ({
        key: item.key,
        label: item.label || item.key,
        marketValue: roundPortfolioMoney(item.marketValue),
        currency: normalizePortfolioCurrency(item.currency, baseCurrency),
        positionsCount: item.positionsCount || 0,
        allocationPercent: total > 0 ? roundPortfolioMoney((Math.max(0, item.marketValue || 0) / total) * 100, 4) : 0,
    }))
}

export function aggregatePortfolioByKey<TItem>(
    items: TItem[],
    keySelector: (item: TItem) => string | null | undefined,
    valueSelector: (item: TItem) => number | null | undefined,
    fallbackKey = 'unclassified',
): PortfolioAggregateResult<TItem>[] {
    const groups = new Map<string, PortfolioAggregateResult<TItem>>()

    for (const item of items) {
        const rawKey = keySelector(item)
        const key = rawKey && rawKey.trim() ? rawKey.trim() : fallbackKey
        const value = Number(valueSelector(item))
        const amount = Number.isFinite(value) ? value : 0
        const group = groups.get(key) || {key, items: [], count: 0, total: 0}

        group.items.push(item)
        group.count += 1
        group.total = roundPortfolioMoney(group.total + amount)
        groups.set(key, group)
    }

    return [...groups.values()].sort((left, right) => right.total - left.total || left.key.localeCompare(right.key))
}

export function isPortfolioValuationStatus(value: string): value is PortfolioValuationStatus {
    return PORTFOLIO_VALUATION_STATUSES.includes(value as PortfolioValuationStatus)
}

export function isPortfolioGroupingKey(value: string): value is PortfolioGroupingKey {
    return PORTFOLIO_GROUPING_KEYS.includes(value as PortfolioGroupingKey)
}
