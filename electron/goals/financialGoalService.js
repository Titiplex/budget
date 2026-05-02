const FINANCIAL_GOAL_TYPES = Object.freeze([
    'SAVINGS',
    'EMERGENCY_FUND',
    'DEBT_PAYOFF',
    'PURCHASE',
    'INVESTMENT',
    'RETIREMENT',
    'NET_WORTH',
    'OTHER',
])

const FINANCIAL_GOAL_STATUSES = Object.freeze(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'])

const GOAL_ERROR_CODES = Object.freeze({
    GOAL_NOT_FOUND: 'goalNotFound',
    INVALID_TARGET_AMOUNT: 'invalidTargetAmount',
    INVALID_HORIZON: 'invalidHorizon',
    INVALID_CURRENCY: 'invalidCurrency',
    PROJECTION_IMPOSSIBLE: 'projectionImpossible',
    INVALID_NAME: 'invalidName',
    INVALID_TARGET_DATE: 'invalidTargetDate',
    INVALID_GOAL_TYPE: 'invalidGoalType',
    INVALID_GOAL_STATUS: 'invalidGoalStatus',
    INVALID_PRIORITY: 'invalidPriority',
    INVALID_STARTING_AMOUNT: 'invalidStartingAmount',
    INVALID_RELATION: 'invalidRelation',
})

const GOAL_TYPE_ALIASES = Object.freeze({
    savings: 'SAVINGS',
    emergencyfund: 'EMERGENCY_FUND',
    emergency_fund: 'EMERGENCY_FUND',
    debtpayoff: 'DEBT_PAYOFF',
    debt_payoff: 'DEBT_PAYOFF',
    purchase: 'PURCHASE',
    investment: 'INVESTMENT',
    retirement: 'RETIREMENT',
    networth: 'NET_WORTH',
    net_worth: 'NET_WORTH',
    other: 'OTHER',
})

const GOAL_STATUS_ALIASES = Object.freeze({
    active: 'ACTIVE',
    paused: 'PAUSED',
    completed: 'COMPLETED',
    archived: 'ARCHIVED',
})

class GoalServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'GoalServiceError'
        this.code = code
        this.field = options.field || null
        this.goalId = options.goalId || null
        this.details = options.details || null
        this.recoverable = options.recoverable ?? true
    }
}

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function hasOwn(data, fieldName) {
    return Object.prototype.hasOwnProperty.call(Object(data), fieldName)
}

function normalizeEnumToken(value) {
    return String(value || '')
        .trim()
        .replace(/[\s-]+/g, '_')
}

function requireName(value) {
    const normalized = normalizeText(value)

    if (!normalized) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_NAME, "Le nom de l'objectif est obligatoire.", {
            field: 'name',
        })
    }

    return normalized
}

function requireId(value, fieldName = 'id') {
    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new GoalServiceError(GOAL_ERROR_CODES.GOAL_NOT_FOUND, "L'objectif est introuvable.", {
            field: fieldName,
            goalId: Number.isFinite(parsed) ? parsed : null,
        })
    }

    return parsed
}

function optionalId(value, fieldName) {
    if (value == null || value === '') return null

    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_RELATION, `${fieldName} est invalide.`, {
            field: fieldName,
        })
    }

    return parsed
}

function normalizeGoalType(value, fallback = null) {
    const token = normalizeEnumToken(value)

    if (!token) {
        if (fallback) return fallback
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_GOAL_TYPE, "Le type d'objectif est obligatoire.", {
            field: 'type',
        })
    }

    const upperToken = token.toUpperCase()
    const normalized = FINANCIAL_GOAL_TYPES.includes(upperToken)
        ? upperToken
        : GOAL_TYPE_ALIASES[token.replace(/_/g, '').toLowerCase()] || GOAL_TYPE_ALIASES[token.toLowerCase()]

    if (!normalized) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_GOAL_TYPE, "Le type d'objectif est invalide.", {
            field: 'type',
        })
    }

    return normalized
}

function normalizeGoalStatus(value, fallback = 'ACTIVE') {
    const token = normalizeEnumToken(value)

    if (!token) return fallback

    const upperToken = token.toUpperCase()
    const normalized = FINANCIAL_GOAL_STATUSES.includes(upperToken)
        ? upperToken
        : GOAL_STATUS_ALIASES[token.toLowerCase()]

    if (!normalized) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_GOAL_STATUS, "Le statut de l'objectif est invalide.", {
            field: 'status',
        })
    }

    return normalized
}

function requireTargetAmount(value) {
    const parsed = Number(value)

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new GoalServiceError(
            GOAL_ERROR_CODES.INVALID_TARGET_AMOUNT,
            'Le montant cible doit être strictement positif.',
            {field: 'targetAmount'},
        )
    }

    return parsed
}

function optionalNonNegativeNumber(value, fieldName, message, errorCode) {
    if (value == null || value === '') return null

    const parsed = Number(value)

    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new GoalServiceError(errorCode, message, {field: fieldName})
    }

    return parsed
}

function normalizePriority(value) {
    if (value == null || value === '') return null

    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new GoalServiceError(
            GOAL_ERROR_CODES.INVALID_PRIORITY,
            "La priorité de l'objectif doit être un entier positif ou nul.",
            {field: 'priority'},
        )
    }

    return parsed
}

function normalizeCurrency(value) {
    const normalized = normalizeText(value)?.toUpperCase()

    if (!normalized) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_CURRENCY, 'La devise est obligatoire.', {
            field: 'currency',
        })
    }

    if (!/^[A-Z]{3}$/.test(normalized)) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_CURRENCY, 'La devise doit être un code ISO à 3 lettres.', {
            field: 'currency',
        })
    }

    return normalized
}

function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function optionalTargetDate(value, now = new Date()) {
    if (value == null || value === '') return null

    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)

    if (Number.isNaN(parsed.getTime())) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_TARGET_DATE, 'La date cible est invalide.', {
            field: 'targetDate',
        })
    }

    if (parsed.getTime() < startOfUtcDay(now).getTime()) {
        throw new GoalServiceError(
            GOAL_ERROR_CODES.INVALID_TARGET_DATE,
            'La date cible doit être aujourd’hui ou dans le futur.',
            {field: 'targetDate'},
        )
    }

    return parsed
}

function putRequiredField(payload, data, fieldName, normalizer, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = normalizer(data?.[fieldName])
    }
}

function putOptionalField(payload, data, fieldName, normalizer, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = normalizer(data?.[fieldName])
    }
}

function buildFinancialGoalPayload(data, options = {}) {
    const partial = Boolean(options.partial)
    const now = options.now || new Date()
    const payload = {}

    putRequiredField(payload, data, 'name', requireName, partial)
    putRequiredField(payload, data, 'type', (value) => normalizeGoalType(value, partial ? null : 'OTHER'), partial)
    putRequiredField(payload, data, 'targetAmount', requireTargetAmount, partial)
    putRequiredField(payload, data, 'currency', normalizeCurrency, partial)
    putOptionalField(payload, data, 'targetDate', (value) => optionalTargetDate(value, now), partial)
    putOptionalField(
        payload,
        data,
        'startingAmount',
        (value) => optionalNonNegativeNumber(
            value,
            'startingAmount',
            'Le montant de départ doit être positif ou nul.',
            GOAL_ERROR_CODES.INVALID_STARTING_AMOUNT,
        ),
        partial,
    )
    putOptionalField(payload, data, 'status', (value) => normalizeGoalStatus(value, 'ACTIVE'), partial)
    putOptionalField(payload, data, 'priority', normalizePriority, partial)
    putOptionalField(payload, data, 'notes', normalizeText, partial)
    putOptionalField(payload, data, 'trackedAssetId', (value) => optionalId(value, 'trackedAssetId'), partial)
    putOptionalField(payload, data, 'trackedPortfolioId', (value) => optionalId(value, 'trackedPortfolioId'), partial)
    putOptionalField(payload, data, 'trackedLiabilityId', (value) => optionalId(value, 'trackedLiabilityId'), partial)
    putOptionalField(
        payload,
        data,
        'baselineNetWorthSnapshotId',
        (value) => optionalId(value, 'baselineNetWorthSnapshotId'),
        partial,
    )

    return payload
}

function includeFinancialGoalRelations() {
    return {
        trackedAsset: true,
        trackedPortfolio: true,
        trackedLiability: true,
        baselineNetWorthSnapshot: true,
    }
}

function toIsoString(value) {
    if (value == null) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function serializeGoal(goal) {
    if (!goal) return null

    return {
        ...goal,
        targetDate: toIsoString(goal.targetDate),
        createdAt: toIsoString(goal.createdAt),
        updatedAt: toIsoString(goal.updatedAt),
        trackedAsset: goal.trackedAsset || null,
        trackedPortfolio: goal.trackedPortfolio || null,
        trackedLiability: goal.trackedLiability || null,
        baselineNetWorthSnapshot: goal.baselineNetWorthSnapshot
            ? {
                ...goal.baselineNetWorthSnapshot,
                snapshotDate: toIsoString(goal.baselineNetWorthSnapshot.snapshotDate),
                createdAt: toIsoString(goal.baselineNetWorthSnapshot.createdAt),
                updatedAt: toIsoString(goal.baselineNetWorthSnapshot.updatedAt),
            }
            : null,
    }
}

function buildGoalWhere(filters = {}) {
    if (!filters || typeof filters !== 'object') return {}

    const where = {}
    const status = normalizeText(filters.status)
    const type = normalizeText(filters.type)
    const currency = normalizeText(filters.currency)
    const search = normalizeText(filters.search)

    if (status && status.toUpperCase() !== 'ALL') {
        where.status = normalizeGoalStatus(status)
    }

    if (type && type.toUpperCase() !== 'ALL') {
        where.type = normalizeGoalType(type)
    }

    if (currency && currency.toUpperCase() !== 'ALL') {
        where.currency = normalizeCurrency(currency)
    }

    if (search) {
        where.OR = [{name: {contains: search}}, {notes: {contains: search}}]
    }

    return where
}

async function assertOptionalRelationExists(delegate, id, message, fieldName) {
    if (id == null) return

    const row = await delegate.findUnique({where: {id}})

    if (!row) {
        throw new GoalServiceError(GOAL_ERROR_CODES.INVALID_RELATION, message, {field: fieldName})
    }
}

async function validateGoalRelations(prisma, payload) {
    if (hasOwn(payload, 'trackedAssetId')) {
        await assertOptionalRelationExists(
            prisma.asset,
            payload.trackedAssetId,
            "L'actif lié est introuvable.",
            'trackedAssetId',
        )
    }

    if (hasOwn(payload, 'trackedPortfolioId')) {
        await assertOptionalRelationExists(
            prisma.portfolio,
            payload.trackedPortfolioId,
            'Le portefeuille lié est introuvable.',
            'trackedPortfolioId',
        )
    }

    if (hasOwn(payload, 'trackedLiabilityId')) {
        await assertOptionalRelationExists(
            prisma.liability,
            payload.trackedLiabilityId,
            'La dette liée est introuvable.',
            'trackedLiabilityId',
        )
    }

    if (hasOwn(payload, 'baselineNetWorthSnapshotId')) {
        await assertOptionalRelationExists(
            prisma.netWorthSnapshot,
            payload.baselineNetWorthSnapshotId,
            'Le snapshot de patrimoine lié est introuvable.',
            'baselineNetWorthSnapshotId',
        )
    }
}

async function assertGoalExists(prisma, goalId) {
    const goal = await prisma.financialGoal.findUnique({where: {id: goalId}})

    if (!goal) {
        throw new GoalServiceError(GOAL_ERROR_CODES.GOAL_NOT_FOUND, "L'objectif est introuvable.", {
            field: 'id',
            goalId,
        })
    }

    return goal
}

async function listFinancialGoals(prisma, filters = {}) {
    const goals = await prisma.financialGoal.findMany({
        where: buildGoalWhere(filters),
        include: includeFinancialGoalRelations(),
        orderBy: [{status: 'asc'}, {priority: 'asc'}, {targetDate: 'asc'}, {name: 'asc'}],
    })

    return goals.map(serializeGoal)
}

async function getFinancialGoalById(prisma, id) {
    const goalId = requireId(id)
    const goal = await prisma.financialGoal.findUnique({
        where: {id: goalId},
        include: includeFinancialGoalRelations(),
    })

    if (!goal) {
        throw new GoalServiceError(GOAL_ERROR_CODES.GOAL_NOT_FOUND, "L'objectif est introuvable.", {
            field: 'id',
            goalId,
        })
    }

    return serializeGoal(goal)
}

async function createFinancialGoal(prisma, data, options = {}) {
    const payload = buildFinancialGoalPayload(data, {now: options.now})

    await validateGoalRelations(prisma, payload)

    const goal = await prisma.financialGoal.create({
        data: payload,
        include: includeFinancialGoalRelations(),
    })

    return serializeGoal(goal)
}

async function updateFinancialGoal(prisma, id, data, options = {}) {
    const goalId = requireId(id)
    const payload = buildFinancialGoalPayload(data, {partial: true, now: options.now})

    await assertGoalExists(prisma, goalId)
    await validateGoalRelations(prisma, payload)

    const goal = await prisma.financialGoal.update({
        where: {id: goalId},
        data: payload,
        include: includeFinancialGoalRelations(),
    })

    return serializeGoal(goal)
}

async function deleteFinancialGoal(prisma, id) {
    const goalId = requireId(id)

    await assertGoalExists(prisma, goalId)
    await prisma.financialGoal.delete({where: {id: goalId}})

    return {ok: true, id: goalId, entityType: 'financialGoal'}
}

function toGoalIpcError(error) {
    if (error instanceof GoalServiceError) {
        return {
            code: error.code,
            message: error.message,
            field: error.field,
            goalId: error.goalId,
            details: error.details,
            recoverable: error.recoverable,
        }
    }

    return {
        code: 'unknownGoalError',
        message: error?.message || 'Erreur inconnue pendant la gestion des objectifs.',
        field: null,
        goalId: null,
        details: null,
        recoverable: false,
    }
}

module.exports = {
    FINANCIAL_GOAL_STATUSES,
    FINANCIAL_GOAL_TYPES,
    GOAL_ERROR_CODES,
    GoalServiceError,
    buildFinancialGoalPayload,
    buildGoalWhere,
    createFinancialGoal,
    deleteFinancialGoal,
    getFinancialGoalById,
    includeFinancialGoalRelations,
    listFinancialGoals,
    normalizeCurrency,
    normalizeGoalStatus,
    normalizeGoalType,
    requireId,
    serializeGoal,
    toGoalIpcError,
    updateFinancialGoal,
    validateGoalRelations,
}
