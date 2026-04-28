function normalizeCurrency(value, fallback = null) {
    if (typeof value !== 'string' || !value.trim()) return fallback
    return value.trim().toUpperCase()
}

function parseDate(value, fallback = new Date()) {
    if (!value) return fallback

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Date invalide.')
    }

    return parsed
}

function isIncluded(record) {
    return record.status !== 'ARCHIVED' && record.includeInNetWorth !== false
}

function valueWithOwnership(value, ownershipPercent = 100) {
    const amount = Number(value || 0)
    const percent = Number(ownershipPercent ?? 100)

    if (!Number.isFinite(amount)) return 0
    if (!Number.isFinite(percent)) return amount

    return amount * Math.max(0, Math.min(100, percent)) / 100
}

function emptyTotals() {
    return {
        totalStandaloneAssets: 0,
        totalPortfolios: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        netWorth: 0,
    }
}

function buildOverview({assets, portfolios, liabilities, currency = null, latestSnapshot = null}) {
    const selectedCurrency = normalizeCurrency(currency)
    const activeAssets = assets.filter(isIncluded)
    const activePortfolios = portfolios.filter(isIncluded)
    const activeLiabilities = liabilities.filter(isIncluded)

    const currencies = Array.from(
        new Set(
            [...activeAssets, ...activePortfolios, ...activeLiabilities].map((record) =>
                normalizeCurrency(record.currency, 'CAD'),
            ),
        ),
    ).sort()

    const canConsolidate = Boolean(selectedCurrency) || currencies.length <= 1
    const displayCurrency = selectedCurrency || currencies[0] || 'CAD'
    const totalsByCurrency = {}
    const breakdown = []

    function bucket(code) {
        if (!totalsByCurrency[code]) totalsByCurrency[code] = emptyTotals()
        return totalsByCurrency[code]
    }

    for (const asset of activeAssets) {
        const code = normalizeCurrency(asset.currency, 'CAD')
        if (selectedCurrency && code !== selectedCurrency) continue

        const amount = valueWithOwnership(asset.currentValue, asset.ownershipPercent)
        const totals = bucket(code)

        totals.totalStandaloneAssets += amount
        totals.totalAssets += amount

        breakdown.push({
            key: `asset-${asset.id}`,
            entityType: 'asset',
            id: asset.id,
            label: asset.name,
            type: asset.type,
            amount,
            currency: code,
            percentOfTotal: null,
        })
    }

    for (const portfolio of activePortfolios) {
        const code = normalizeCurrency(portfolio.currency, 'CAD')
        if (selectedCurrency && code !== selectedCurrency) continue

        const amount = valueWithOwnership(portfolio.currentValue, portfolio.ownershipPercent)
        const totals = bucket(code)

        totals.totalPortfolios += amount
        totals.totalAssets += amount

        breakdown.push({
            key: `portfolio-${portfolio.id}`,
            entityType: 'portfolio',
            id: portfolio.id,
            label: portfolio.name,
            type: portfolio.type,
            amount,
            currency: code,
            percentOfTotal: null,
        })
    }

    for (const liability of activeLiabilities) {
        const code = normalizeCurrency(liability.currency, 'CAD')
        if (selectedCurrency && code !== selectedCurrency) continue

        const amount = Number(liability.currentBalance || 0)
        const totals = bucket(code)

        totals.totalLiabilities += Number.isFinite(amount) ? amount : 0

        breakdown.push({
            key: `liability-${liability.id}`,
            entityType: 'liability',
            id: liability.id,
            label: liability.name,
            type: liability.type,
            amount,
            currency: code,
            percentOfTotal: null,
        })
    }

    for (const totals of Object.values(totalsByCurrency)) {
        totals.netWorth = totals.totalAssets - totals.totalLiabilities
    }

    for (const row of breakdown) {
        const totals = totalsByCurrency[row.currency]
        const denominator = row.entityType === 'liability' ? totals.totalLiabilities : totals.totalAssets

        row.percentOfTotal = denominator ? row.amount / denominator : null
    }

    const consolidated = totalsByCurrency[displayCurrency] || emptyTotals()

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
            assetCount: activeAssets.length,
            portfolioCount: activePortfolios.length,
            liabilityCount: activeLiabilities.length,
            snapshotDate: latestSnapshot?.snapshotDate || null,
        },
        totalsByCurrency,
        breakdown,
        assets,
        portfolios,
        liabilities,
        latestSnapshot,
    }
}

async function getWealthOverview(prisma, options = {}) {
    const currency = normalizeCurrency(options?.currency)

    const [assets, portfolios, liabilities, latestSnapshot] = await Promise.all([
        prisma.asset.findMany({
            orderBy: [{status: 'asc'}, {name: 'asc'}],
            include: {securedLiabilities: true},
        }),
        prisma.portfolio.findMany({
            orderBy: [{status: 'asc'}, {name: 'asc'}],
            include: {account: true},
        }),
        prisma.liability.findMany({
            orderBy: [{status: 'asc'}, {name: 'asc'}],
            include: {account: true, securedAsset: true},
        }),
        prisma.netWorthSnapshot.findFirst({
            where: currency ? {currency} : undefined,
            orderBy: {snapshotDate: 'desc'},
        }),
    ])

    return buildOverview({assets, portfolios, liabilities, currency, latestSnapshot})
}

async function createGeneratedNetWorthSnapshot(prisma, options = {}) {
    const currency = normalizeCurrency(options?.currency, 'CAD')
    const overview = await getWealthOverview(prisma, {currency})

    if (!overview.canConsolidate || overview.totals.netWorth == null) {
        throw new Error('Impossible de créer un snapshot consolidé sans devise cible.')
    }

    return prisma.netWorthSnapshot.create({
        data: {
            snapshotDate: parseDate(options?.snapshotDate),
            currency,
            totalStandaloneAssets: overview.totals.totalStandaloneAssets,
            totalPortfolios: overview.totals.totalPortfolios,
            totalAssets: overview.totals.totalAssets,
            totalLiabilities: overview.totals.totalLiabilities,
            netWorth: overview.totals.netWorth,
            source: 'GENERATED',
            assetBreakdownJson: JSON.stringify(overview.breakdown.filter((row) => row.entityType === 'asset')),
            portfolioBreakdownJson: JSON.stringify(overview.breakdown.filter((row) => row.entityType === 'portfolio')),
            liabilityBreakdownJson: JSON.stringify(overview.breakdown.filter((row) => row.entityType === 'liability')),
            note: options?.note || null,
        },
    })
}

async function listNetWorthSnapshots(prisma, filters = {}) {
    const where = {}

    if (filters?.currency) {
        where.currency = normalizeCurrency(filters.currency)
    }

    if (filters?.startDate || filters?.endDate) {
        where.snapshotDate = {}
        if (filters.startDate) where.snapshotDate.gte = parseDate(filters.startDate)
        if (filters.endDate) where.snapshotDate.lte = parseDate(filters.endDate)
    }

    return prisma.netWorthSnapshot.findMany({
        where,
        orderBy: {snapshotDate: 'desc'},
    })
}

module.exports = {
    buildOverview,
    getWealthOverview,
    createGeneratedNetWorthSnapshot,
    listNetWorthSnapshots,
}
