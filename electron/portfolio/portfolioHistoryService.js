const {calculatePortfolioMetrics} = require('./portfolioMetricsService')
const {calculatePortfolioIncome} = require('./portfolioIncomeService')
const {roundMoney} = require('./portfolioValuationService')

const SNAPSHOT_SOURCES = new Set(['MANUAL', 'GENERATED', 'IMPORTED'])
const COMPLETENESS_STATUSES = new Set(['COMPLETE', 'PARTIAL', 'MISSING', 'UNKNOWN'])

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const maybeNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const currency = (value, fallback = 'CAD') => (text(value) || fallback).toUpperCase()

function normalizeDate(value, fallback = new Date()) {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value == null || value === '' ? fallback : value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function startOfUtcDay(value) {
    const date = normalizeDate(value)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function serializeDate(value) {
    return startOfUtcDay(value).toISOString().slice(0, 10)
}

function normalizeSource(value) {
    const source = (text(value) || 'MANUAL').toUpperCase()
    return SNAPSHOT_SOURCES.has(source) ? source : 'MANUAL'
}

function normalizeCompletenessStatus(value) {
    const status = (text(value) || 'UNKNOWN').toUpperCase()
    return COMPLETENESS_STATUSES.has(status) ? status : 'UNKNOWN'
}

function normalizePeriod(input = {}) {
    const snapshotDate = startOfUtcDay(input.snapshotDate || input.date || input.asOf || new Date())
    return {
        snapshotDate,
        periodKey: input.periodKey || serializeDate(snapshotDate),
    }
}

function createSnapshotKey({portfolioId = null, periodKey, currency: snapshotCurrency, source}) {
    return [portfolioId == null ? 'global' : String(portfolioId), periodKey, currency(snapshotCurrency), normalizeSource(source)].join(':')
}

function getValuedPositionsCount(portfolioState = {}) {
    if (portfolioState.totals?.totalValuedPositions != null) return numberOr(portfolioState.totals.totalValuedPositions)
    return (portfolioState.positions || []).filter((position) => position.marketValue != null).length
}

function getMissingValuePositionsCount(portfolioState = {}) {
    if (portfolioState.totals?.totalMissingValuePositions != null) return numberOr(portfolioState.totals.totalMissingValuePositions)
    return (portfolioState.positions || []).filter((position) => position.marketValue == null).length
}

function resolveCompletenessStatus(portfolioState = {}, explicitStatus = null) {
    if (explicitStatus) return normalizeCompletenessStatus(explicitStatus)
    const positionsCount = Array.isArray(portfolioState.positions) ? portfolioState.positions.length : numberOr(portfolioState.totals?.positionsCount)
    const valuedPositionsCount = getValuedPositionsCount(portfolioState)
    const missingValuePositionsCount = getMissingValuePositionsCount(portfolioState)

    if (positionsCount === 0 || valuedPositionsCount === 0) return 'MISSING'
    if (missingValuePositionsCount > 0) return 'PARTIAL'
    return 'COMPLETE'
}

function safeJson(value) {
    try {
        return JSON.stringify(value || null)
    } catch (_) {
        return null
    }
}

function parseJson(value) {
    if (!value || typeof value !== 'string') return null
    try {
        return JSON.parse(value)
    } catch (_) {
        return null
    }
}

function buildSnapshotPayload(portfolioState, incomeState, input = {}) {
    const positions = Array.isArray(portfolioState.positions) ? portfolioState.positions : []
    return {
        totals: portfolioState.totals || {},
        gainMetrics: portfolioState.gainMetrics || null,
        incomeSummary: incomeState?.summary || null,
        positions: positions.map((position) => ({
            id: position.id,
            assetId: position.assetId,
            accountId: position.accountId,
            marketValue: position.marketValue,
            investedCost: position.investedCost,
            valuationStatus: position.valuationStatus,
            completenessStatus: position.marketValue == null ? 'MISSING' : 'COMPLETE',
        })),
        warnings: [...(portfolioState.warnings || []), ...(incomeState?.warnings || [])],
        metadata: input.metadata || null,
    }
}

function buildPortfolioSnapshot(input = {}, portfolioState = {}, incomeState = null) {
    const {snapshotDate, periodKey} = normalizePeriod(input)
    const source = normalizeSource(input.source)
    const snapshotCurrency = currency(input.currency || input.baseCurrency || portfolioState.baseCurrency || portfolioState.totals?.currency)
    const positionsCount = Array.isArray(portfolioState.positions) ? portfolioState.positions.length : numberOr(portfolioState.totals?.positionsCount)
    const valuedPositionsCount = getValuedPositionsCount(portfolioState)
    const missingValuePositionsCount = getMissingValuePositionsCount(portfolioState)
    const completenessStatus = resolveCompletenessStatus(portfolioState, input.completenessStatus)
    const totalMarketValue = roundMoney(portfolioState.totals?.totalMarketValue ?? input.totalMarketValue)
    const totalInvestedCost = roundMoney(portfolioState.totals?.totalInvestedCost ?? input.totalInvestedCost)
    const totalUnrealizedGain = roundMoney(
        portfolioState.totals?.totalUnrealizedGain ??
        portfolioState.gainMetrics?.totalUnrealizedGain ??
        input.totalUnrealizedGain,
    )
    const cumulativeIncome = incomeState?.summary?.totalIncome ?? input.cumulativeIncome ?? null
    const cumulativeFees = incomeState?.summary?.totalFees ?? input.cumulativeFees ?? null
    const portfolioId = maybeNumber(input.portfolioId ?? portfolioState.portfolioId)

    return {
        id: maybeNumber(input.id),
        snapshotKey: createSnapshotKey({portfolioId, periodKey, currency: snapshotCurrency, source}),
        portfolioId,
        snapshotDate,
        periodKey,
        source,
        currency: snapshotCurrency,
        totalMarketValue,
        totalInvestedCost,
        totalUnrealizedGain,
        cumulativeIncome: cumulativeIncome == null ? null : roundMoney(cumulativeIncome),
        cumulativeFees: cumulativeFees == null ? null : roundMoney(cumulativeFees),
        completenessStatus,
        positionsCount,
        valuedPositionsCount,
        missingValuePositionsCount,
        payloadJson: safeJson(buildSnapshotPayload(portfolioState, incomeState, input)),
        note: input.note || null,
        createdAt: input.createdAt ? normalizeDate(input.createdAt) : undefined,
        updatedAt: input.updatedAt ? normalizeDate(input.updatedAt) : undefined,
    }
}

function deserializeSnapshot(snapshot) {
    if (!snapshot) return null
    return {
        ...snapshot,
        snapshotDate: normalizeDate(snapshot.snapshotDate),
        createdAt: snapshot.createdAt ? normalizeDate(snapshot.createdAt) : snapshot.createdAt,
        updatedAt: snapshot.updatedAt ? normalizeDate(snapshot.updatedAt) : snapshot.updatedAt,
        payload: parseJson(snapshot.payloadJson),
    }
}

function matchesPeriod(snapshot, filter = {}) {
    const value = normalizeDate(snapshot.snapshotDate).getTime()
    const start = filter.startDate ? startOfUtcDay(filter.startDate).getTime() : Number.NEGATIVE_INFINITY
    const end = filter.endDate ? startOfUtcDay(filter.endDate).getTime() : Number.POSITIVE_INFINITY
    return value >= start && value < end
}

function matchesSnapshotFilter(snapshot, filter = {}) {
    if (filter.portfolioId !== undefined && maybeNumber(snapshot.portfolioId) !== maybeNumber(filter.portfolioId)) return false
    if (filter.currency && currency(snapshot.currency) !== currency(filter.currency)) return false
    if (filter.source && normalizeSource(snapshot.source) !== normalizeSource(filter.source)) return false
    return matchesPeriod(snapshot, filter)
}

function createMemoryPortfolioSnapshotRepository(initialSnapshots = []) {
    let nextId = 1
    const snapshots = initialSnapshots.map((snapshot) => {
        const normalized = deserializeSnapshot(snapshot)
        const id = normalized.id || nextId++
        nextId = Math.max(nextId, id + 1)
        return {...normalized, id}
    })

    return {
        async findDuplicate(snapshot) {
            return snapshots.find((item) => item.snapshotKey === snapshot.snapshotKey) || null
        },
        async createSnapshot(snapshot) {
            const now = new Date()
            const stored = deserializeSnapshot({
                ...snapshot,
                id: snapshot.id || nextId++,
                createdAt: snapshot.createdAt || now,
                updatedAt: snapshot.updatedAt || now,
            })
            snapshots.push(stored)
            return stored
        },
        async updateSnapshot(id, snapshot) {
            const index = snapshots.findIndex((item) => item.id === id)
            if (index === -1) return null
            snapshots[index] = deserializeSnapshot({...snapshots[index], ...snapshot, id, updatedAt: new Date()})
            return snapshots[index]
        },
        async listSnapshots(filter = {}) {
            return snapshots
                .filter((snapshot) => matchesSnapshotFilter(snapshot, filter))
                .sort((left, right) => normalizeDate(left.snapshotDate) - normalizeDate(right.snapshotDate) || left.id - right.id)
                .map(deserializeSnapshot)
        },
        async getLatestSnapshot(filter = {}) {
            const items = await this.listSnapshots(filter)
            return items[items.length - 1] || null
        },
        _all() {
            return snapshots.map(deserializeSnapshot)
        },
    }
}

function createPrismaPortfolioSnapshotRepository(prisma) {
    if (!prisma?.portfolioSnapshot) {
        throw new Error('Prisma client does not expose portfolioSnapshot. Run the Prisma migration/generation first.')
    }

    return {
        findDuplicate(snapshot) {
            return prisma.portfolioSnapshot.findUnique({where: {snapshotKey: snapshot.snapshotKey}})
        },
        createSnapshot(snapshot) {
            return prisma.portfolioSnapshot.create({data: snapshot})
        },
        updateSnapshot(id, snapshot) {
            return prisma.portfolioSnapshot.update({where: {id}, data: snapshot})
        },
        listSnapshots(filter = {}) {
            const where = {}
            if (filter.portfolioId !== undefined) where.portfolioId = maybeNumber(filter.portfolioId)
            if (filter.currency) where.currency = currency(filter.currency)
            if (filter.source) where.source = normalizeSource(filter.source)
            if (filter.startDate || filter.endDate) {
                where.snapshotDate = {}
                if (filter.startDate) where.snapshotDate.gte = startOfUtcDay(filter.startDate)
                if (filter.endDate) where.snapshotDate.lt = startOfUtcDay(filter.endDate)
            }
            return prisma.portfolioSnapshot.findMany({where, orderBy: [{snapshotDate: 'asc'}, {id: 'asc'}]})
        },
        async getLatestSnapshot(filter = {}) {
            const where = {}
            if (filter.portfolioId !== undefined) where.portfolioId = maybeNumber(filter.portfolioId)
            if (filter.currency) where.currency = currency(filter.currency)
            if (filter.source) where.source = normalizeSource(filter.source)
            return prisma.portfolioSnapshot.findFirst({where, orderBy: [{snapshotDate: 'desc'}, {id: 'desc'}]})
        },
    }
}

function resolveRepository(dependencies = {}) {
    if (dependencies.repository) return dependencies.repository
    if (dependencies.prisma) return createPrismaPortfolioSnapshotRepository(dependencies.prisma)
    return createMemoryPortfolioSnapshotRepository()
}

async function resolvePortfolioState(input = {}, dependencies = {}) {
    if (input.portfolioState) return input.portfolioState
    if (input.metrics) return input.metrics
    return calculatePortfolioMetrics(input, dependencies)
}

async function resolveIncomeState(input = {}, dependencies = {}) {
    if (input.incomeState) return input.incomeState
    if (input.income) return input.income
    if (input.includeIncome || input.incomeMovements) {
        return calculatePortfolioIncome({
            ...input,
            movements: input.incomeMovements || input.movements || [],
            startDate: input.incomeStartDate || input.startDate,
            endDate: input.incomeEndDate || input.endDate,
        }, dependencies)
    }
    return null
}

async function createPortfolioSnapshot(input = {}, dependencies = {}) {
    const repository = resolveRepository(dependencies)
    const portfolioState = await resolvePortfolioState(input, dependencies)
    const incomeState = await resolveIncomeState(input, dependencies)
    const snapshot = buildPortfolioSnapshot(input, portfolioState, incomeState)
    const existing = await repository.findDuplicate(snapshot)

    if (existing && !input.replaceDuplicate) {
        return {
            snapshot: deserializeSnapshot(existing),
            created: false,
            duplicate: true,
            replaced: false,
        }
    }

    if (existing && input.replaceDuplicate) {
        const updated = await repository.updateSnapshot(existing.id, snapshot)
        return {
            snapshot: deserializeSnapshot(updated),
            created: false,
            duplicate: true,
            replaced: true,
        }
    }

    const created = await repository.createSnapshot(snapshot)
    return {
        snapshot: deserializeSnapshot(created),
        created: true,
        duplicate: false,
        replaced: false,
    }
}

async function readPortfolioSnapshotHistory(input = {}, dependencies = {}) {
    const repository = resolveRepository(dependencies)
    const snapshots = await repository.listSnapshots({
        portfolioId: input.portfolioId,
        startDate: input.startDate,
        endDate: input.endDate,
        currency: input.currency || input.baseCurrency,
        source: input.source,
    })
    return {
        portfolioId: input.portfolioId ?? null,
        currency: input.currency || input.baseCurrency || null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        snapshots: snapshots.map(deserializeSnapshot),
    }
}

async function generateAutomaticPortfolioSnapshotIfNeeded(input = {}, dependencies = {}) {
    return createPortfolioSnapshot({...input, source: 'GENERATED'}, dependencies)
}

function createPortfolioHistoryService(dependencies = {}) {
    const repository = resolveRepository(dependencies)
    return {
        repository,
        createPortfolioSnapshot: (input = {}) => createPortfolioSnapshot(input, {...dependencies, repository}),
        generateAutomaticPortfolioSnapshotIfNeeded: (input = {}) =>
            generateAutomaticPortfolioSnapshotIfNeeded(input, {...dependencies, repository}),
        readPortfolioSnapshotHistory: (input = {}) => readPortfolioSnapshotHistory(input, {...dependencies, repository}),
    }
}

module.exports = {
    buildPortfolioSnapshot,
    createMemoryPortfolioSnapshotRepository,
    createPortfolioHistoryService,
    createPortfolioSnapshot,
    createPrismaPortfolioSnapshotRepository,
    generateAutomaticPortfolioSnapshotIfNeeded,
    readPortfolioSnapshotHistory,
    serializeDate,
}
