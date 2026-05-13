export type AnalyticsCurrencyCode = string

export type AnalyticsRecordStatus = 'ACTIVE' | 'ARCHIVED' | string
export type AnalyticsFreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN' | 'UNAVAILABLE' | string

export interface PortfolioAnalyticsHolding {
    id: number | string
    portfolioId: number | string
    name: string
    assetClass: string
    currency?: AnalyticsCurrencyCode | null
    quantity?: number | null
    unitPrice?: number | null
    marketValue?: number | null
    costBasis?: number | null
    includeInAnalytics?: boolean | null
    priceFreshnessStatus?: AnalyticsFreshnessStatus | null
    freshnessStatus?: AnalyticsFreshnessStatus | null
    marketInstrument?: {
        freshnessStatus?: AnalyticsFreshnessStatus | null
    } | null
}

export interface PortfolioAnalyticsPortfolio {
    id: number | string
    name: string
    type: string
    currency?: AnalyticsCurrencyCode | null
    currentValue?: number | null
    cashBalance?: number | null
    status?: AnalyticsRecordStatus | null
    includeInNetWorth?: boolean | null
    holdings?: PortfolioAnalyticsHolding[] | null
}

export interface PortfolioAnalyticsLiability {
    id: number | string
    name: string
    type: string
    currency?: AnalyticsCurrencyCode | null
    currentBalance?: number | null
    status?: AnalyticsRecordStatus | null
    includeInNetWorth?: boolean | null
    portfolioId?: number | string | null
}

export interface PortfolioAnalyticsInput {
    portfolios?: PortfolioAnalyticsPortfolio[] | null
    holdings?: PortfolioAnalyticsHolding[] | null
    liabilities?: PortfolioAnalyticsLiability[] | null
    currency?: AnalyticsCurrencyCode | null
    includeLiabilities?: boolean
    decimals?: number
    percentDecimals?: number
}

export interface AnalyticsAmountBucket {
    amount: number
    currency: AnalyticsCurrencyCode
}

export interface AnalyticsCurrencyBucket {
    currency: AnalyticsCurrencyCode
    totalAssets: number
    totalLiabilities: number
    netWorth: number
}

export interface PortfolioAnalyticsRow {
    key: string
    entityType: 'portfolio' | 'holding' | 'cash' | 'liability'
    id: number | string
    portfolioId?: number | string | null
    label: string
    type: string
    amount: number
    currency: AnalyticsCurrencyCode
    allocationPercent: number
    hasPrice: boolean
    isStale: boolean
}

export interface PortfolioAnalyticsResult {
    currency: AnalyticsCurrencyCode | null
    currencies: AnalyticsCurrencyCode[]
    canConsolidate: boolean
    totalAssets: number | null
    totalLiabilities: number | null
    netWorth: number | null
    totalsByPortfolio: Record<string, AnalyticsAmountBucket>
    totalsByAssetType: Record<string, AnalyticsAmountBucket>
    totalsByCurrency: Record<string, AnalyticsCurrencyBucket>
    allocation: PortfolioAnalyticsRow[]
    missingPriceHoldings: PortfolioAnalyticsRow[]
    staleHoldings: PortfolioAnalyticsRow[]
    liabilityRows: PortfolioAnalyticsRow[]
}

export interface PortfolioSnapshotBreakdownRow {
    key: string
    entityType: 'holding' | 'cash' | 'portfolio' | 'liability' | string
    id: number | string | null
    label: string
    type: string
    amount: number
    currency: AnalyticsCurrencyCode
}

export interface PortfolioAnalyticsSnapshot {
    snapshotDate: string | Date
    currency?: AnalyticsCurrencyCode | null
    totalAssets?: number | null
    totalLiabilities?: number | null
    netWorth?: number | null
    breakdown?: PortfolioSnapshotBreakdownRow[] | null
}

export interface PortfolioSnapshotContribution {
    key: string
    entityType: string
    id: number | string | null
    label: string
    previousAmount: number
    currentAmount: number
    delta: number
    contributionAmount: number
    contributionPercent: number
    currency: AnalyticsCurrencyCode
}

export interface PortfolioSnapshotVariation {
    previousDate: string
    currentDate: string
    currency: AnalyticsCurrencyCode
    totalAssetsDelta: number
    totalLiabilitiesDelta: number
    netWorthDelta: number
    netWorthPercentChange: number | null
    contributions: PortfolioSnapshotContribution[]
}

const DEFAULT_CURRENCY = 'CAD'

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

export function roundTo(value: number | null | undefined, decimals = 2): number {
    const parsed = Number(value || 0)
    if (!Number.isFinite(parsed)) return 0

    const factor = 10 ** decimals
    return Math.round((parsed + Number.EPSILON) * factor) / factor
}

export function normalizeAnalyticsCurrency(value: unknown, fallback = DEFAULT_CURRENCY): AnalyticsCurrencyCode {
    if (typeof value !== 'string' || !value.trim()) return fallback
    return value.trim().toUpperCase()
}

function isActiveIncluded(record: {status?: AnalyticsRecordStatus | null; includeInNetWorth?: boolean | null}) {
    return record.status !== 'ARCHIVED' && record.includeInNetWorth !== false
}

function holdingFreshness(holding: PortfolioAnalyticsHolding): AnalyticsFreshnessStatus | null {
    return holding.priceFreshnessStatus || holding.freshnessStatus || holding.marketInstrument?.freshnessStatus || null
}

function isStaleHolding(holding: PortfolioAnalyticsHolding): boolean {
    return holdingFreshness(holding) === 'STALE'
}

function holdingValue(holding: PortfolioAnalyticsHolding): {amount: number; hasPrice: boolean} {
    if (isFiniteNumber(holding.marketValue)) {
        return {amount: Math.max(0, holding.marketValue), hasPrice: true}
    }

    if (isFiniteNumber(holding.quantity) && isFiniteNumber(holding.unitPrice)) {
        return {amount: Math.max(0, holding.quantity * holding.unitPrice), hasPrice: true}
    }

    return {amount: 0, hasPrice: false}
}

function addToBucket(target: Record<string, AnalyticsAmountBucket>, key: string, amount: number, currency: string, decimals: number) {
    if (!target[key]) {
        target[key] = {amount: 0, currency}
    }

    target[key].amount = roundTo(target[key].amount + amount, decimals)
}

function addToCurrencyBucket(target: Record<string, AnalyticsCurrencyBucket>, currency: string) {
    if (!target[currency]) {
        target[currency] = {
            currency,
            totalAssets: 0,
            totalLiabilities: 0,
            netWorth: 0,
        }
    }

    return target[currency]
}

function sortObjectByKey<T>(input: Record<string, T>): Record<string, T> {
    return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)))
}

function applyAllocationPercentages(rows: PortfolioAnalyticsRow[], totalsByCurrency: Record<string, AnalyticsCurrencyBucket>, percentDecimals: number) {
    const grouped = new Map<string, PortfolioAnalyticsRow[]>()

    for (const row of rows) {
        if (row.entityType === 'liability') continue
        if (!grouped.has(row.currency)) grouped.set(row.currency, [])
        grouped.get(row.currency)?.push(row)
    }

    for (const [currency, currencyRows] of grouped.entries()) {
        const totalAssets = totalsByCurrency[currency]?.totalAssets || 0
        const positiveRows = currencyRows.filter((row) => row.amount > 0)

        if (!totalAssets || positiveRows.length === 0) {
            for (const row of currencyRows) row.allocationPercent = 0
            continue
        }

        for (const row of currencyRows) {
            row.allocationPercent = row.amount > 0 ? roundTo(row.amount / totalAssets * 100, percentDecimals) : 0
        }

        const roundedTotal = roundTo(
            positiveRows.reduce((total, row) => total + row.allocationPercent, 0),
            percentDecimals,
        )
        const adjustment = roundTo(100 - roundedTotal, percentDecimals)

        if (adjustment !== 0) {
            const largestRow = positiveRows.reduce((largest, row) => (row.amount > largest.amount ? row : largest), positiveRows[0])
            largestRow.allocationPercent = roundTo(largestRow.allocationPercent + adjustment, percentDecimals)
        }
    }
}

function portfolioHasOwnHoldings(portfolio: PortfolioAnalyticsPortfolio): boolean {
    return Array.isArray(portfolio.holdings)
}

export function calculatePortfolioAnalytics(input: PortfolioAnalyticsInput = {}): PortfolioAnalyticsResult {
    const decimals = input.decimals ?? 2
    const percentDecimals = input.percentDecimals ?? 2
    const selectedCurrency = input.currency ? normalizeAnalyticsCurrency(input.currency) : null
    const includeLiabilities = input.includeLiabilities !== false
    const portfolios = (input.portfolios || []).filter(isActiveIncluded)
    const standaloneHoldings = input.holdings || []
    const liabilities = (input.liabilities || []).filter(isActiveIncluded)

    const rows: PortfolioAnalyticsRow[] = []
    const liabilityRows: PortfolioAnalyticsRow[] = []
    const totalsByPortfolio: Record<string, AnalyticsAmountBucket> = {}
    const totalsByAssetType: Record<string, AnalyticsAmountBucket> = {}
    const totalsByCurrency: Record<string, AnalyticsCurrencyBucket> = {}

    function shouldKeepCurrency(currency: string) {
        return !selectedCurrency || currency === selectedCurrency
    }

    function pushAssetRow(row: PortfolioAnalyticsRow) {
        if (!shouldKeepCurrency(row.currency)) return

        rows.push(row)
        addToBucket(totalsByAssetType, row.type, row.amount, row.currency, decimals)
        const currencyBucket = addToCurrencyBucket(totalsByCurrency, row.currency)
        currencyBucket.totalAssets = roundTo(currencyBucket.totalAssets + row.amount, decimals)
    }

    for (const portfolio of portfolios) {
        const portfolioCurrency = normalizeAnalyticsCurrency(portfolio.currency)
        const portfolioKey = String(portfolio.id)
        let portfolioTotal = 0

        if (portfolioHasOwnHoldings(portfolio)) {
            for (const holding of portfolio.holdings || []) {
                if (holding.includeInAnalytics === false) continue

                const currency = normalizeAnalyticsCurrency(holding.currency, portfolioCurrency)
                const {amount, hasPrice} = holdingValue(holding)
                const row: PortfolioAnalyticsRow = {
                    key: `holding-${holding.id}`,
                    entityType: 'holding',
                    id: holding.id,
                    portfolioId: portfolio.id,
                    label: holding.name,
                    type: holding.assetClass || 'OTHER',
                    amount: roundTo(amount, decimals),
                    currency,
                    allocationPercent: 0,
                    hasPrice,
                    isStale: isStaleHolding(holding),
                }

                pushAssetRow(row)
                if (shouldKeepCurrency(currency)) {
                    portfolioTotal = roundTo(portfolioTotal + row.amount, decimals)
                }
            }
        } else {
            const amount = isFiniteNumber(portfolio.currentValue) ? Math.max(0, portfolio.currentValue) : 0
            const row: PortfolioAnalyticsRow = {
                key: `portfolio-${portfolio.id}`,
                entityType: 'portfolio',
                id: portfolio.id,
                portfolioId: portfolio.id,
                label: portfolio.name,
                type: portfolio.type || 'OTHER',
                amount: roundTo(amount, decimals),
                currency: portfolioCurrency,
                allocationPercent: 0,
                hasPrice: true,
                isStale: false,
            }

            pushAssetRow(row)
            if (shouldKeepCurrency(portfolioCurrency)) {
                portfolioTotal = roundTo(portfolioTotal + row.amount, decimals)
            }
        }

        const cashBalance = isFiniteNumber(portfolio.cashBalance) ? Math.max(0, portfolio.cashBalance) : 0
        if (cashBalance > 0) {
            const row: PortfolioAnalyticsRow = {
                key: `portfolio-${portfolio.id}-cash`,
                entityType: 'cash',
                id: `${portfolio.id}:cash`,
                portfolioId: portfolio.id,
                label: `${portfolio.name} cash`,
                type: 'CASH',
                amount: roundTo(cashBalance, decimals),
                currency: portfolioCurrency,
                allocationPercent: 0,
                hasPrice: true,
                isStale: false,
            }

            pushAssetRow(row)
            if (shouldKeepCurrency(portfolioCurrency)) {
                portfolioTotal = roundTo(portfolioTotal + row.amount, decimals)
            }
        }

        if (shouldKeepCurrency(portfolioCurrency)) {
            totalsByPortfolio[portfolioKey] = {
                amount: roundTo(portfolioTotal, decimals),
                currency: portfolioCurrency,
            }
        }
    }

    for (const holding of standaloneHoldings) {
        if (holding.includeInAnalytics === false) continue

        const currency = normalizeAnalyticsCurrency(holding.currency)
        const {amount, hasPrice} = holdingValue(holding)
        pushAssetRow({
            key: `holding-${holding.id}`,
            entityType: 'holding',
            id: holding.id,
            portfolioId: holding.portfolioId,
            label: holding.name,
            type: holding.assetClass || 'OTHER',
            amount: roundTo(amount, decimals),
            currency,
            allocationPercent: 0,
            hasPrice,
            isStale: isStaleHolding(holding),
        })
    }

    if (includeLiabilities) {
        for (const liability of liabilities) {
            const currency = normalizeAnalyticsCurrency(liability.currency)
            if (!shouldKeepCurrency(currency)) continue

            const amount = roundTo(Math.max(0, Number(liability.currentBalance || 0)), decimals)
            const row: PortfolioAnalyticsRow = {
                key: `liability-${liability.id}`,
                entityType: 'liability',
                id: liability.id,
                portfolioId: liability.portfolioId || null,
                label: liability.name,
                type: liability.type || 'OTHER',
                amount,
                currency,
                allocationPercent: 0,
                hasPrice: true,
                isStale: false,
            }
            liabilityRows.push(row)

            const currencyBucket = addToCurrencyBucket(totalsByCurrency, currency)
            currencyBucket.totalLiabilities = roundTo(currencyBucket.totalLiabilities + amount, decimals)
        }
    }

    for (const bucket of Object.values(totalsByCurrency)) {
        bucket.totalAssets = roundTo(bucket.totalAssets, decimals)
        bucket.totalLiabilities = roundTo(bucket.totalLiabilities, decimals)
        bucket.netWorth = roundTo(bucket.totalAssets - bucket.totalLiabilities, decimals)
    }

    applyAllocationPercentages(rows, totalsByCurrency, percentDecimals)

    const currencies = Object.keys(totalsByCurrency).sort()
    const canConsolidate = Boolean(selectedCurrency) || currencies.length <= 1
    const displayCurrency = selectedCurrency || currencies[0] || DEFAULT_CURRENCY
    const consolidated = totalsByCurrency[displayCurrency]

    return {
        currency: canConsolidate ? displayCurrency : null,
        currencies,
        canConsolidate,
        totalAssets: canConsolidate ? consolidated?.totalAssets || 0 : null,
        totalLiabilities: canConsolidate ? consolidated?.totalLiabilities || 0 : null,
        netWorth: canConsolidate ? consolidated?.netWorth || 0 : null,
        totalsByPortfolio: sortObjectByKey(totalsByPortfolio),
        totalsByAssetType: sortObjectByKey(totalsByAssetType),
        totalsByCurrency: sortObjectByKey(totalsByCurrency),
        allocation: rows.sort((left, right) => left.key.localeCompare(right.key)),
        missingPriceHoldings: rows.filter((row) => row.entityType === 'holding' && !row.hasPrice),
        staleHoldings: rows.filter((row) => row.entityType === 'holding' && row.isStale),
        liabilityRows,
    }
}

function snapshotDateString(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toBreakdownMap(rows: PortfolioSnapshotBreakdownRow[] | null | undefined) {
    const map = new Map<string, PortfolioSnapshotBreakdownRow>()
    for (const row of rows || []) {
        map.set(row.key, row)
    }
    return map
}

export function calculateSnapshotVariation(
    previous: PortfolioAnalyticsSnapshot,
    current: PortfolioAnalyticsSnapshot,
    decimals = 2,
): PortfolioSnapshotVariation {
    const currency = normalizeAnalyticsCurrency(current.currency || previous.currency)
    const previousNetWorth = roundTo(previous.netWorth, decimals)
    const currentNetWorth = roundTo(current.netWorth, decimals)
    const netWorthDelta = roundTo(currentNetWorth - previousNetWorth, decimals)
    const previousRows = toBreakdownMap(previous.breakdown)
    const currentRows = toBreakdownMap(current.breakdown)
    const keys = Array.from(new Set([...previousRows.keys(), ...currentRows.keys()])).sort()

    const contributions = keys.map((key) => {
        const previousRow = previousRows.get(key)
        const currentRow = currentRows.get(key)
        const row = currentRow || previousRow
        const previousAmount = roundTo(previousRow?.amount, decimals)
        const currentAmount = roundTo(currentRow?.amount, decimals)
        const rawDelta = roundTo(currentAmount - previousAmount, decimals)
        const contributionAmount = row?.entityType === 'liability' ? roundTo(-rawDelta, decimals) : rawDelta

        return {
            key,
            entityType: row?.entityType || 'unknown',
            id: row?.id ?? null,
            label: row?.label || key,
            previousAmount,
            currentAmount,
            delta: rawDelta,
            contributionAmount,
            contributionPercent: netWorthDelta === 0 ? 0 : roundTo(contributionAmount / netWorthDelta * 100, decimals),
            currency: normalizeAnalyticsCurrency(row?.currency, currency),
        }
    })

    return {
        previousDate: snapshotDateString(previous.snapshotDate),
        currentDate: snapshotDateString(current.snapshotDate),
        currency,
        totalAssetsDelta: roundTo(Number(current.totalAssets || 0) - Number(previous.totalAssets || 0), decimals),
        totalLiabilitiesDelta: roundTo(Number(current.totalLiabilities || 0) - Number(previous.totalLiabilities || 0), decimals),
        netWorthDelta,
        netWorthPercentChange: previousNetWorth === 0 ? null : roundTo(netWorthDelta / previousNetWorth * 100, decimals),
        contributions,
    }
}

export function buildSnapshotFromAnalytics(
    analytics: PortfolioAnalyticsResult,
    snapshotDate: string | Date,
    currency = analytics.currency || DEFAULT_CURRENCY,
): PortfolioAnalyticsSnapshot {
    return {
        snapshotDate,
        currency,
        totalAssets: analytics.totalAssets || 0,
        totalLiabilities: analytics.totalLiabilities || 0,
        netWorth: analytics.netWorth || 0,
        breakdown: [
            ...analytics.allocation.map((row) => ({
                key: row.key,
                entityType: row.entityType,
                id: row.id,
                label: row.label,
                type: row.type,
                amount: row.amount,
                currency: row.currency,
            })),
            ...analytics.liabilityRows.map((row) => ({
                key: row.key,
                entityType: row.entityType,
                id: row.id,
                label: row.label,
                type: row.type,
                amount: row.amount,
                currency: row.currency,
            })),
        ],
    }
}
