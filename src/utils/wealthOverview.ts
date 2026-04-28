
export type WealthRecordStatus = 'ACTIVE' | 'ARCHIVED'

export interface WealthValuableRecord {
  id: number
  name: string
  type: string
  status: WealthRecordStatus
  currency: string
  currentValue?: number
  currentBalance?: number
  includeInNetWorth?: boolean
  ownershipPercent?: number
  valueAsOf?: string | Date | null
  balanceAsOf?: string | Date | null
}

export interface WealthOverviewInput {
  assets: WealthValuableRecord[]
  portfolios: WealthValuableRecord[]
  liabilities: WealthValuableRecord[]
  currency?: string | null
}

export interface WealthCurrencyTotals {
  totalStandaloneAssets: number
  totalPortfolios: number
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

export interface WealthBreakdownRow {
  key: string
  entityType: 'asset' | 'portfolio' | 'liability'
  id: number
  label: string
  type: string
  amount: number
  currency: string
  percentOfTotal: number | null
}

export interface WealthOverviewResult {
  currency: string | null
  currencies: string[]
  canConsolidate: boolean
  totals: {
    totalStandaloneAssets: number | null
    totalPortfolios: number | null
    totalAssets: number | null
    totalLiabilities: number | null
    netWorth: number | null
    assetCount: number
    portfolioCount: number
    liabilityCount: number
  }
  totalsByCurrency: Record<string, WealthCurrencyTotals>
  breakdown: WealthBreakdownRow[]
}

function currencyOf(record: WealthValuableRecord) {
  return (record.currency || 'CAD').toUpperCase()
}

function isIncluded(record: WealthValuableRecord) {
  return record.status !== 'ARCHIVED' && record.includeInNetWorth !== false
}

function ownershipMultiplier(record: WealthValuableRecord) {
  const percent = record.ownershipPercent ?? 100
  if (!Number.isFinite(percent)) return 1
  return Math.max(0, Math.min(100, percent)) / 100
}

function valueOf(record: WealthValuableRecord, field: 'currentValue' | 'currentBalance') {
  const value = Number(record[field] ?? 0)
  if (!Number.isFinite(value)) return 0
  return value * ownershipMultiplier(record)
}

function emptyCurrencyBucket(): WealthCurrencyTotals {
  return {
    totalStandaloneAssets: 0,
    totalPortfolios: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
  }
}

export function buildWealthOverview(input: WealthOverviewInput): WealthOverviewResult {
  const assets = input.assets.filter(isIncluded)
  const portfolios = input.portfolios.filter(isIncluded)
  const liabilities = input.liabilities.filter(isIncluded)

  const selectedCurrency = input.currency?.toUpperCase() || null
  const relevantCurrencies = new Set<string>()

  for (const record of [...assets, ...portfolios, ...liabilities]) {
    relevantCurrencies.add(currencyOf(record))
  }

  const currencies = [...relevantCurrencies].sort()
  const canConsolidate = Boolean(selectedCurrency) || currencies.length <= 1
  const displayCurrency = selectedCurrency || currencies[0] || 'CAD'
  const totalsByCurrency: Record<string, WealthCurrencyTotals> = {}
  const breakdown: WealthBreakdownRow[] = []

  function bucket(currency: string) {
    if (!totalsByCurrency[currency]) {
      totalsByCurrency[currency] = emptyCurrencyBucket()
    }

    return totalsByCurrency[currency]
  }

  for (const asset of assets) {
    const currency = currencyOf(asset)
    if (selectedCurrency && currency !== selectedCurrency) continue

    const amount = valueOf(asset, 'currentValue')
    const totals = bucket(currency)

    totals.totalStandaloneAssets += amount
    totals.totalAssets += amount

    breakdown.push({
      key: `asset-${asset.id}`,
      entityType: 'asset',
      id: asset.id,
      label: asset.name,
      type: asset.type,
      amount,
      currency,
      percentOfTotal: null,
    })
  }

  for (const portfolio of portfolios) {
    const currency = currencyOf(portfolio)
    if (selectedCurrency && currency !== selectedCurrency) continue

    const amount = valueOf(portfolio, 'currentValue')
    const totals = bucket(currency)

    totals.totalPortfolios += amount
    totals.totalAssets += amount

    breakdown.push({
      key: `portfolio-${portfolio.id}`,
      entityType: 'portfolio',
      id: portfolio.id,
      label: portfolio.name,
      type: portfolio.type,
      amount,
      currency,
      percentOfTotal: null,
    })
  }

  for (const liability of liabilities) {
    const currency = currencyOf(liability)
    if (selectedCurrency && currency !== selectedCurrency) continue

    const amount = valueOf(liability, 'currentBalance')
    const totals = bucket(currency)

    totals.totalLiabilities += amount

    breakdown.push({
      key: `liability-${liability.id}`,
      entityType: 'liability',
      id: liability.id,
      label: liability.name,
      type: liability.type,
      amount,
      currency,
      percentOfTotal: null,
    })
  }

  for (const totals of Object.values(totalsByCurrency)) {
    totals.netWorth = totals.totalAssets - totals.totalLiabilities
  }

  for (const row of breakdown) {
    const denominator =
      row.entityType === 'liability'
        ? totalsByCurrency[row.currency]?.totalLiabilities
        : totalsByCurrency[row.currency]?.totalAssets

    row.percentOfTotal = denominator ? row.amount / denominator : null
  }

  const consolidated = totalsByCurrency[displayCurrency] || emptyCurrencyBucket()

  return {
    currency: canConsolidate ? displayCurrency : null,
    currencies,
    canConsolidate,
    totals: {
      totalStandaloneAssets: canConsolidate ? consolidated.totalStandaloneAssets : null,
      totalPortfolios: canConsolidate ? consolidated.totalPortfolios : null,
      totalAssets: canConsolidate ? consolidated.totalAssets : null,
      totalLiabilities: canConsolidate ? consolidated.totalLiabilities : null,
      netWorth: canConsolidate ? consolidated.netWorth : null,
      assetCount: assets.length,
      portfolioCount: portfolios.length,
      liabilityCount: liabilities.length,
    },
    totalsByCurrency,
    breakdown,
  }
}
