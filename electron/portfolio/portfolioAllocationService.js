const {calculatePortfolioMetrics} = require('./portfolioMetricsService')
const {roundMoney} = require('./portfolioValuationService')

const GROUPING_KEYS = ['asset', 'account', 'assetClass', 'sector', 'geography', 'currency']
const UNKNOWN_KEY = 'unknown'
const UNKNOWN_LABEL = 'Non classé'

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const maybeNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const currency = (value, fallback = 'CAD') => (text(value) || fallback).toUpperCase()

function slug(value) {
    const normalized = text(value)
    if (!normalized) return UNKNOWN_KEY

    return normalized
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || UNKNOWN_KEY
}

function known(value) {
    const normalized = text(value)
    return normalized && !['unknown', 'non classe', 'non classé', 'n/a', 'na', 'none', 'null'].includes(slug(normalized))
}

function hasMarketValue(position) {
    return position?.marketValue != null && Number.isFinite(Number(position.marketValue)) && Number(position.marketValue) > 0
}

function positionValue(position) {
    return hasMarketValue(position) ? Math.max(0, Number(position.marketValue)) : 0
}

function positionCompleteness(position) {
    if (!hasMarketValue(position)) return 'missing_value'
    return 'complete'
}

function assetInfo(position) {
    return position?.asset || position?.instrument || {}
}

function assetId(position) {
    return maybeNumber(position?.assetId ?? assetInfo(position).id ?? position?.instrumentId ?? position?.id)
}

function accountId(position) {
    return maybeNumber(position?.accountId ?? position?.account?.id)
}

function createGroupIdentity(position, groupBy) {
    const asset = assetInfo(position)

    if (groupBy === 'asset') {
        const id = assetId(position)
        const symbol = text(asset.symbol ?? position.symbol)
        const name = text(asset.name ?? position.name)

        if (id != null || symbol || name) {
            return {
                key: id != null ? String(id) : slug(symbol || name),
                label: name || symbol || `Actif ${id}`,
                rawKey: id ?? symbol ?? name,
                isUnknown: false,
            }
        }
    }

    if (groupBy === 'account') {
        const id = accountId(position)
        const name = text(position.accountName ?? position.account?.name)

        if (id != null || name) {
            return {
                key: id != null ? String(id) : slug(name),
                label: name || `Compte ${id}`,
                rawKey: id ?? name,
                isUnknown: false,
            }
        }
    }

    if (groupBy === 'assetClass') {
        const value = asset.assetClass ?? position.assetClass
        if (known(value)) return {key: slug(value), label: text(value), rawKey: value, isUnknown: false}
    }

    if (groupBy === 'sector') {
        const value = asset.sector ?? position.sector
        if (known(value)) return {key: slug(value), label: text(value), rawKey: value, isUnknown: false}
    }

    if (groupBy === 'geography') {
        const value = asset.geography ?? asset.geographicRegion ?? position.geography ?? position.geographicRegion
        if (known(value)) return {key: slug(value), label: text(value), rawKey: value, isUnknown: false}
    }

    if (groupBy === 'currency') {
        const value = asset.currency ?? position.nativeCurrency ?? position.quoteCurrency ?? position.valuationCurrency ?? position.currency
        if (known(value)) {
            const normalized = currency(value)
            return {key: normalized, label: normalized, rawKey: normalized, isUnknown: false}
        }
    }

    return {key: UNKNOWN_KEY, label: UNKNOWN_LABEL, rawKey: null, isUnknown: true}
}

function resolveCompletionStatus(group, totalPositions) {
    if (group.valuedPositionsCount === 0) return 'missing'
    if (group.missingValuePositionsCount > 0 || group.unknownCategoryPositionsCount > 0) return 'partial'
    if (group.positionsCount < totalPositions && groupByIsCategorical(group.groupBy)) return 'complete'
    return 'complete'
}

function groupByIsCategorical(groupBy) {
    return ['assetClass', 'sector', 'geography'].includes(groupBy)
}

function createEmptyGroup(groupBy, identity) {
    return {
        groupBy,
        key: identity.key,
        label: identity.label,
        rawKey: identity.rawKey,
        marketValue: 0,
        value: 0,
        allocationPercent: 0,
        positionsCount: 0,
        valuedPositionsCount: 0,
        missingValuePositionsCount: 0,
        unknownCategoryPositionsCount: 0,
        completenessStatus: 'missing',
        positionIds: [],
    }
}

function calculateAllocationGroups(positions = [], groupBy, options = {}) {
    if (!GROUPING_KEYS.includes(groupBy)) {
        throw new Error(`Unsupported portfolio allocation grouping: ${groupBy}`)
    }

    const valuedTotal = options.totalMarketValue == null
        ? positions.reduce((sum, position) => sum + positionValue(position), 0)
        : Number(options.totalMarketValue)
    const groups = new Map()

    for (const position of positions) {
        const identity = createGroupIdentity(position, groupBy)
        const mapKey = identity.key
        const group = groups.get(mapKey) || createEmptyGroup(groupBy, identity)
        const value = positionValue(position)

        group.marketValue = roundMoney(group.marketValue + value)
        group.value = group.marketValue
        group.positionsCount += 1
        if (hasMarketValue(position)) group.valuedPositionsCount += 1
        else group.missingValuePositionsCount += 1
        if (identity.isUnknown) group.unknownCategoryPositionsCount += 1
        group.positionIds.push(position.id)
        groups.set(mapKey, group)
    }

    return [...groups.values()]
        .map((group) => ({
            ...group,
            allocationPercent: valuedTotal > 0 ? roundMoney((group.marketValue / valuedTotal) * 100, 4) : 0,
            completenessStatus: resolveCompletionStatus(group, positions.length),
        }))
        .sort((left, right) => right.marketValue - left.marketValue || left.label.localeCompare(right.label))
}

function calculateAllAllocationGroups(positions = [], options = {}) {
    const valuedTotal = options.totalMarketValue == null
        ? roundMoney(positions.reduce((sum, position) => sum + positionValue(position), 0))
        : roundMoney(options.totalMarketValue)
    const byGroup = {}

    for (const groupBy of GROUPING_KEYS) {
        byGroup[groupBy] = calculateAllocationGroups(positions, groupBy, {...options, totalMarketValue: valuedTotal})
    }

    return {
        totalAllocatedValue: valuedTotal,
        totalValuedPositions: positions.filter(hasMarketValue).length,
        totalMissingValuePositions: positions.filter((position) => !hasMarketValue(position)).length,
        byGroup,
        flat: GROUPING_KEYS.flatMap((groupBy) => byGroup[groupBy]),
    }
}

async function resolvePortfolioInput(input = {}, dependencies = {}) {
    if (input.allocatablePositions) {
        return {
            baseCurrency: currency(input.baseCurrency ?? input.currency ?? dependencies.baseCurrency),
            asOf: input.asOf || dependencies.asOf || dependencies.now?.() || new Date(),
            positions: input.allocatablePositions,
            totals: input.totals || {},
            warnings: input.warnings || [],
        }
    }

    if (input.metrics) return input.metrics
    if (input.valuation) return input.valuation

    return calculatePortfolioMetrics(input, dependencies)
}

async function calculatePortfolioAllocations(input = {}, dependencies = {}) {
    const portfolio = await resolvePortfolioInput(input, dependencies)
    const positions = Array.isArray(portfolio.positions) ? portfolio.positions : []
    const totalMarketValue = portfolio.totals?.totalMarketValue == null
        ? positions.reduce((sum, position) => sum + positionValue(position), 0)
        : Number(portfolio.totals.totalMarketValue)
    const allocations = calculateAllAllocationGroups(positions, {totalMarketValue})

    return {
        ...portfolio,
        allocations,
        allocationGroups: allocations.byGroup,
        totals: {
            ...(portfolio.totals || {}),
            totalAllocatedValue: allocations.totalAllocatedValue,
            totalValuedPositions: allocations.totalValuedPositions,
            totalMissingValuePositions: allocations.totalMissingValuePositions,
        },
    }
}

function createPortfolioAllocationService(dependencies = {}) {
    return {
        calculatePortfolioAllocations: (input = {}) => calculatePortfolioAllocations(input, dependencies),
        calculateAllocationGroups,
        calculateAllAllocationGroups,
    }
}

module.exports = {
    GROUPING_KEYS,
    UNKNOWN_KEY,
    UNKNOWN_LABEL,
    calculateAllocationGroups,
    calculateAllAllocationGroups,
    calculatePortfolioAllocations,
    createPortfolioAllocationService,
}
