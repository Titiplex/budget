const {calculatePortfolioAllocations} = require('./portfolioAllocationService')
const {calculatePortfolioIncome} = require('./portfolioIncomeService')
const {readPortfolioSnapshotHistory} = require('./portfolioHistoryService')
const {roundMoney} = require('./portfolioValuationService')

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const currency = (value, fallback = 'CAD') => (text(value) || fallback).toUpperCase()
const maybeNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)

function normalizeDate(value, fallback = new Date()) {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value == null || value === '' ? fallback : value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function isoDate(value, fallback = new Date()) {
    return normalizeDate(value, fallback).toISOString().slice(0, 10)
}

function monthsAgo(value, count) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - count, date.getUTCDate()))
}

function startOfCurrentMonth(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endExclusiveOfNextDay(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1))
}

function serializeSnapshot(snapshot) {
    return {
        id: snapshot.id,
        snapshotDate: isoDate(snapshot.snapshotDate),
        totalMarketValue: roundMoney(snapshot.totalMarketValue),
        totalInvestedCost: roundMoney(snapshot.totalInvestedCost),
        totalUnrealizedGain: roundMoney(snapshot.totalUnrealizedGain),
        cumulativeIncome: snapshot.cumulativeIncome == null ? null : roundMoney(snapshot.cumulativeIncome),
        cumulativeFees: snapshot.cumulativeFees == null ? null : roundMoney(snapshot.cumulativeFees),
        currency: currency(snapshot.currency),
        completenessStatus: snapshot.completenessStatus || 'UNKNOWN',
        source: snapshot.source || 'MANUAL',
    }
}

function toHistorySeries(history = {}) {
    return (history.snapshots || []).map(serializeSnapshot)
}

function summarizeDataStatus(positions = []) {
    const empty = {fresh: 0, stale: 0, missing: 0, manual: 0, error: 0, total: positions.length}
    for (const position of positions) {
        const status = String(position.valuationStatus || position.freshnessStatus || 'missing').toLowerCase()
        if (status === 'market' || status === 'fresh') empty.fresh += 1
        else if (status === 'stale') empty.stale += 1
        else if (status === 'manual') empty.manual += 1
        else if (status === 'error') empty.error += 1
        else empty.missing += 1
    }
    return empty
}

function getAllocationBlock(allocations, key) {
    return allocations?.byGroup?.[key] || []
}

function buildPortfolioDashboardState({allocations, income, history, baseCurrency, asOf, portfolioId = null}) {
    const positions = allocations.positions || []
    const totals = allocations.totals || {}
    const gainMetrics = allocations.gainMetrics || {}
    const dataStatus = summarizeDataStatus(positions)
    const historySeries = toHistorySeries(history)
    const isEmpty = positions.length === 0
    const hasNoPrice = !isEmpty && dataStatus.fresh + dataStatus.stale + dataStatus.manual === 0

    return {
        portfolioId,
        baseCurrency,
        asOf: normalizeDate(asOf).toISOString(),
        isEmpty,
        hasNoPrice,
        hasHistory: historySeries.length > 0,
        kpis: {
            totalMarketValue: roundMoney(totals.totalMarketValue),
            totalInvestedCost: roundMoney(totals.totalInvestedCost),
            totalUnrealizedGain: roundMoney(totals.totalUnrealizedGain ?? gainMetrics.totalUnrealizedGain),
            totalUnrealizedGainPercent: totals.totalUnrealizedGainPercent ?? gainMetrics.totalUnrealizedGainPercent ?? null,
            periodIncome: roundMoney(income.summary?.totalIncome),
            periodFees: roundMoney(income.summary?.totalFees),
            netIncome: roundMoney(income.summary?.netIncome),
            grossReturnSimple: totals.grossReturnSimple ?? gainMetrics.grossReturnSimple ?? null,
        },
        allocationBlocks: {
            asset: getAllocationBlock(allocations.allocations, 'asset'),
            assetClass: getAllocationBlock(allocations.allocations, 'assetClass'),
            sector: getAllocationBlock(allocations.allocations, 'sector'),
            geography: getAllocationBlock(allocations.allocations, 'geography'),
            currency: getAllocationBlock(allocations.allocations, 'currency'),
        },
        dataStatus,
        history: historySeries,
        income,
        warnings: [...(allocations.warnings || []), ...(income.summary?.unconvertedByCurrency || []).map((row) => ({
            positionId: null,
            warning: `${row.amount} ${row.currency} ${row.kind} non convertis`,
        }))],
        ctas: {
            addAsset: 'Ajouter un actif',
            addMovement: 'Saisir un mouvement',
        },
    }
}

async function loadPortfolioDashboardSource(prisma, options = {}) {
    if (!prisma) {
        return {
            positions: options.positions || [],
            movements: options.movements || [],
            priceSnapshots: options.priceSnapshots || [],
        }
    }

    const portfolioId = maybeNumber(options.portfolioId)
    const positionWhere = portfolioId == null ? {} : {portfolioId}
    const movementWhere = portfolioId == null ? {} : {portfolioId}

    const [positions, movements] = await Promise.all([
        prisma.investmentPosition.findMany({
            where: positionWhere,
            include: {
                account: true,
                portfolio: true,
                instrument: {include: {marketInstrument: true}},
            },
            orderBy: [{status: 'asc'}, {id: 'asc'}],
        }),
        prisma.investmentMovement.findMany({
            where: movementWhere,
            include: {account: true, instrument: true},
            orderBy: [{operationDate: 'asc'}, {id: 'asc'}],
        }),
    ])

    const positionIds = positions.map((position) => position.id)
    const marketInstrumentIds = positions
        .map((position) => position.instrument?.marketInstrumentId)
        .filter((id) => id != null)

    const priceSnapshots = positionIds.length || marketInstrumentIds.length
        ? await prisma.priceSnapshot.findMany({
            where: {
                OR: [
                    positionIds.length ? {investmentPositionId: {in: positionIds}} : undefined,
                    marketInstrumentIds.length ? {marketInstrumentId: {in: marketInstrumentIds}} : undefined,
                ].filter(Boolean),
            },
            orderBy: [{pricedAt: 'desc'}, {id: 'desc'}],
        })
        : []

    return {positions, movements, priceSnapshots}
}

async function getPortfolioDashboard(input = {}, dependencies = {}) {
    const asOf = normalizeDate(input.asOf || dependencies.asOf || new Date())
    const baseCurrency = currency(input.baseCurrency || input.currency || dependencies.baseCurrency, 'CAD')
    const source = input.positions
        ? {positions: input.positions, movements: input.movements || [], priceSnapshots: input.priceSnapshots || []}
        : await loadPortfolioDashboardSource(dependencies.prisma, input)

    const sharedInput = {
        ...input,
        baseCurrency,
        asOf,
        positions: source.positions,
        movements: source.movements,
        priceSnapshots: source.priceSnapshots,
    }

    const [allocations, income, history] = await Promise.all([
        calculatePortfolioAllocations(sharedInput, dependencies),
        calculatePortfolioIncome({
            ...sharedInput,
            period: input.incomePeriod || 'currentMonth',
            now: asOf,
            startDate: input.incomeStartDate,
            endDate: input.incomeEndDate,
        }, dependencies),
        input.history
            ? Promise.resolve({snapshots: input.history})
            : readPortfolioSnapshotHistory({
                portfolioId: input.portfolioId,
                currency: baseCurrency,
                startDate: input.historyStartDate || isoDate(monthsAgo(asOf, 12)),
                endDate: input.historyEndDate || isoDate(endExclusiveOfNextDay(asOf)),
            }, dependencies),
    ])

    return buildPortfolioDashboardState({
        allocations,
        income,
        history,
        baseCurrency,
        asOf,
        portfolioId: input.portfolioId ?? null,
    })
}

module.exports = {
    buildPortfolioDashboardState,
    getPortfolioDashboard,
    loadPortfolioDashboardSource,
    summarizeDataStatus,
}
