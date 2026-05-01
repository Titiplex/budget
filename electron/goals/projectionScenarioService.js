const SCENARIO_KINDS = Object.freeze(['PESSIMISTIC', 'BASE', 'OPTIMISTIC', 'CUSTOM'])

const KIND_TO_DB = Object.freeze({
    PESSIMISTIC: 'CONSERVATIVE',
    BASE: 'BASELINE',
    OPTIMISTIC: 'OPTIMISTIC',
    CUSTOM: 'CUSTOM',
})

const DB_TO_KIND = Object.freeze({
    CONSERVATIVE: 'PESSIMISTIC',
    BASELINE: 'BASE',
    OPTIMISTIC: 'OPTIMISTIC',
    CUSTOM: 'CUSTOM',
})

const SCENARIO_ERROR_CODES = Object.freeze({
    SCENARIO_NOT_FOUND: 'scenarioNotFound',
    INVALID_NAME: 'invalidScenarioName',
    INVALID_KIND: 'invalidScenarioKind',
    INVALID_HORIZON: 'invalidHorizon',
    INVALID_RATE: 'invalidRate',
    INVALID_CURRENCY: 'invalidCurrency',
    INVALID_MONTHLY_SURPLUS: 'invalidMonthlySurplus',
})

const DEFAULT_SCENARIOS = Object.freeze([
    {
        name: 'Pessimistic',
        kind: 'PESSIMISTIC',
        description: 'Lower-surplus local scenario for conservative projections.',
        monthlySurplus: 250,
        annualGrowthRate: 0.01,
        annualInflationRate: 0.03,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Default editable scenario. Neutral assumptions only; not financial advice.',
    },
    {
        name: 'Base',
        kind: 'BASE',
        description: 'Baseline local scenario for standard projections.',
        monthlySurplus: 500,
        annualGrowthRate: 0.03,
        annualInflationRate: 0.02,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Default editable scenario. Neutral assumptions only; not financial advice.',
    },
    {
        name: 'Optimistic',
        kind: 'OPTIMISTIC',
        description: 'Higher-surplus local scenario for upside projections.',
        monthlySurplus: 750,
        annualGrowthRate: 0.05,
        annualInflationRate: 0.02,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Default editable scenario. Neutral assumptions only; not financial advice.',
    },
])

class ProjectionScenarioServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'ProjectionScenarioServiceError'
        this.code = code
        this.field = options.field || null
        this.scenarioId = options.scenarioId || null
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

function requireId(value, fieldName = 'id') {
    const parsed = Number(value)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.SCENARIO_NOT_FOUND,
            'Le scénario est introuvable.',
            {field: fieldName, scenarioId: Number.isFinite(parsed) ? parsed : null},
        )
    }

    return parsed
}

function requireName(value) {
    const normalized = normalizeText(value)

    if (!normalized) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_NAME,
            'Le nom du scénario est obligatoire.',
            {field: 'name'},
        )
    }

    return normalized
}

function normalizeScenarioKind(value, fallback = null) {
    const normalized = String(value || '')
        .trim()
        .replace(/[\s-]+/g, '_')
        .toUpperCase()

    if (!normalized) {
        if (fallback) return fallback
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_KIND,
            'Le type de scénario est obligatoire.',
            {field: 'kind'},
        )
    }

    const aliases = {
        CONSERVATIVE: 'PESSIMISTIC',
        BASELINE: 'BASE',
        PESSIMISTIC: 'PESSIMISTIC',
        BASE: 'BASE',
        OPTIMISTIC: 'OPTIMISTIC',
        CUSTOM: 'CUSTOM',
    }
    const kind = aliases[normalized]

    if (!kind || !SCENARIO_KINDS.includes(kind)) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_KIND,
            'Le type de scénario est invalide.',
            {field: 'kind'},
        )
    }

    return kind
}

function normalizeCurrency(value, fallback = null) {
    const normalized = normalizeText(value)?.toUpperCase() || fallback

    if (!normalized) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_CURRENCY,
            'La devise est obligatoire.',
            {field: 'currency'},
        )
    }

    if (!/^[A-Z]{3}$/.test(normalized)) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_CURRENCY,
            'La devise doit être un code ISO à 3 lettres.',
            {field: 'currency'},
        )
    }

    return normalized
}

function normalizeBoolean(value, fallback = true) {
    if (value == null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'y', 'oui'].includes(normalized)) return true
        if (['false', '0', 'no', 'n', 'non'].includes(normalized)) return false
    }

    return Boolean(value)
}

function normalizeMonthlySurplus(value, fallback = 0) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = Number(candidate)

    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_MONTHLY_SURPLUS,
            'Le surplus mensuel doit être positif ou nul.',
            {field: 'monthlySurplus'},
        )
    }

    return parsed
}

function normalizeOptionalRate(value, fieldName) {
    if (value == null || value === '') return null

    const parsed = Number(value)

    if (!Number.isFinite(parsed) || parsed < -1 || parsed > 1) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_RATE,
            'Le taux doit être compris entre -100% et 100%.',
            {field: fieldName},
        )
    }

    return parsed
}

function normalizeHorizonMonths(data, options = {}) {
    const fallback = options.fallback ?? 12
    const hasMonths = hasOwn(data, 'horizonMonths') && data.horizonMonths !== '' && data.horizonMonths != null
    const hasYears = hasOwn(data, 'horizonYears') && data.horizonYears !== '' && data.horizonYears != null
    const parsed = hasMonths ? Number(data.horizonMonths) : hasYears ? Number(data.horizonYears) * 12 : fallback

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 1200) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.INVALID_HORIZON,
            'L’horizon doit être un nombre de mois positif et inférieur ou égal à 1200.',
            {field: hasYears && !hasMonths ? 'horizonYears' : 'horizonMonths'},
        )
    }

    return parsed
}

function putField(payload, data, fieldName, normalizer, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = normalizer(data?.[fieldName])
    }
}

function buildProjectionScenarioPayload(data, options = {}) {
    const partial = Boolean(options.partial)
    const payload = {}

    putField(payload, data, 'name', requireName, partial)
    putField(payload, data, 'kind', (value) => normalizeScenarioKind(value, partial ? null : 'CUSTOM'), partial)
    putField(payload, data, 'monthlySurplus', (value) => normalizeMonthlySurplus(value, 0), partial)
    putField(payload, data, 'annualGrowthRate', (value) => normalizeOptionalRate(value, 'annualGrowthRate'), partial)
    putField(payload, data, 'annualInflationRate', (value) => normalizeOptionalRate(value, 'annualInflationRate'), partial)

    if (!partial || hasOwn(data, 'horizonMonths') || hasOwn(data, 'horizonYears')) {
        payload.horizonMonths = normalizeHorizonMonths(data)
    }

    putField(payload, data, 'currency', (value) => normalizeCurrency(value, 'CAD'), partial)
    putField(payload, data, 'description', normalizeText, partial)
    putField(payload, data, 'notes', normalizeText, partial)
    putField(payload, data, 'isDefault', (value) => normalizeBoolean(value, false), partial)
    putField(payload, data, 'isActive', (value) => normalizeBoolean(value, true), partial)

    return payload
}

function rowToScenario(row) {
    if (!row) return null

    return {
        id: Number(row.id),
        name: row.name,
        kind: DB_TO_KIND[row.kind] || 'CUSTOM',
        dbKind: row.kind,
        description: row.description || null,
        monthlySurplus: Number(row.monthlySurplus ?? 0),
        annualGrowthRate: row.annualGrowthRate == null ? null : Number(row.annualGrowthRate),
        annualInflationRate: row.annualInflationRate == null ? null : Number(row.annualInflationRate),
        horizonMonths: Number(row.horizonMonths || 12),
        horizonYears: Number(row.horizonMonths || 12) / 12,
        currency: row.currency || 'CAD',
        isDefault: Boolean(row.isDefault),
        isActive: Boolean(row.isActive),
        notes: row.notes || null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || null,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || null,
    }
}

function sqlString(value) {
    if (value == null) return 'NULL'
    return `'${String(value).replace(/'/g, "''")}'`
}

function sqlNumber(value) {
    if (value == null) return 'NULL'
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 'NULL'
    return String(parsed)
}

function sqlBoolean(value) {
    return value ? 'true' : 'false'
}

async function queryRows(prisma, sql) {
    return prisma.$queryRawUnsafe(sql)
}

async function execute(prisma, sql) {
    return prisma.$executeRawUnsafe(sql)
}

async function getRawScenarioById(prisma, id) {
    const rows = await queryRows(prisma, `SELECT * FROM "ProjectionScenario" WHERE "id" = ${sqlNumber(id)} LIMIT 1`)
    return rows[0] || null
}

async function getRawScenarioByName(prisma, name) {
    const rows = await queryRows(prisma, `SELECT * FROM "ProjectionScenario" WHERE "name" = ${sqlString(name)} LIMIT 1`)
    return rows[0] || null
}

function insertScenarioSql(payload) {
    return `INSERT INTO "ProjectionScenario" (
        "name", "kind", "description", "isDefault", "monthlySurplus", "annualGrowthRate",
        "annualInflationRate", "horizonMonths", "currency", "isActive", "notes", "createdAt", "updatedAt"
    ) VALUES (
        ${sqlString(payload.name)},
        ${sqlString(KIND_TO_DB[payload.kind] || 'CUSTOM')},
        ${sqlString(payload.description)},
        ${sqlBoolean(payload.isDefault)},
        ${sqlNumber(payload.monthlySurplus)},
        ${sqlNumber(payload.annualGrowthRate)},
        ${sqlNumber(payload.annualInflationRate)},
        ${sqlNumber(payload.horizonMonths)},
        ${sqlString(payload.currency)},
        ${sqlBoolean(payload.isActive)},
        ${sqlString(payload.notes)},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )`
}

function updateScenarioSql(id, payload) {
    const assignments = []

    if (hasOwn(payload, 'name')) assignments.push(`"name" = ${sqlString(payload.name)}`)
    if (hasOwn(payload, 'kind')) assignments.push(`"kind" = ${sqlString(KIND_TO_DB[payload.kind] || 'CUSTOM')}`)
    if (hasOwn(payload, 'description')) assignments.push(`"description" = ${sqlString(payload.description)}`)
    if (hasOwn(payload, 'isDefault')) assignments.push(`"isDefault" = ${sqlBoolean(payload.isDefault)}`)
    if (hasOwn(payload, 'monthlySurplus')) assignments.push(`"monthlySurplus" = ${sqlNumber(payload.monthlySurplus)}`)
    if (hasOwn(payload, 'annualGrowthRate')) assignments.push(`"annualGrowthRate" = ${sqlNumber(payload.annualGrowthRate)}`)
    if (hasOwn(payload, 'annualInflationRate')) assignments.push(`"annualInflationRate" = ${sqlNumber(payload.annualInflationRate)}`)
    if (hasOwn(payload, 'horizonMonths')) assignments.push(`"horizonMonths" = ${sqlNumber(payload.horizonMonths)}`)
    if (hasOwn(payload, 'currency')) assignments.push(`"currency" = ${sqlString(payload.currency)}`)
    if (hasOwn(payload, 'isActive')) assignments.push(`"isActive" = ${sqlBoolean(payload.isActive)}`)
    if (hasOwn(payload, 'notes')) assignments.push(`"notes" = ${sqlString(payload.notes)}`)

    assignments.push('"updatedAt" = CURRENT_TIMESTAMP')

    return `UPDATE "ProjectionScenario" SET ${assignments.join(', ')} WHERE "id" = ${sqlNumber(id)}`
}

async function ensureDefaultProjectionScenarios(prisma) {
    const scenarios = []

    for (const defaultScenario of DEFAULT_SCENARIOS) {
        const payload = buildProjectionScenarioPayload(defaultScenario)
        const existing = await getRawScenarioByName(prisma, payload.name)

        if (existing) {
            scenarios.push(rowToScenario(existing))
            continue
        }

        await execute(prisma, insertScenarioSql(payload))
        scenarios.push(rowToScenario(await getRawScenarioByName(prisma, payload.name)))
    }

    return scenarios
}

async function listProjectionScenarios(prisma, filters = {}) {
    await ensureDefaultProjectionScenarios(prisma)

    const where = []

    if (filters && typeof filters === 'object') {
        if (normalizeText(filters.kind) && normalizeText(filters.kind).toUpperCase() !== 'ALL') {
            const kind = normalizeScenarioKind(filters.kind)
            where.push(`"kind" = ${sqlString(KIND_TO_DB[kind] || 'CUSTOM')}`)
        }

        if (normalizeText(filters.currency) && normalizeText(filters.currency).toUpperCase() !== 'ALL') {
            where.push(`"currency" = ${sqlString(normalizeCurrency(filters.currency))}`)
        }

        if (hasOwn(filters, 'isActive') && filters.isActive !== 'ALL') {
            where.push(`"isActive" = ${sqlBoolean(normalizeBoolean(filters.isActive))}`)
        }

        const search = normalizeText(filters.search)
        if (search) {
            where.push(`("name" LIKE ${sqlString(`%${search}%`)} OR "description" LIKE ${sqlString(`%${search}%`)} OR "notes" LIKE ${sqlString(`%${search}%`)})`)
        }
    }

    const sql = `SELECT * FROM "ProjectionScenario"${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY "isDefault" DESC, "kind" ASC, "name" ASC`
    const rows = await queryRows(prisma, sql)

    return rows.map(rowToScenario)
}

async function getProjectionScenarioById(prisma, id) {
    const scenarioId = requireId(id)
    const row = await getRawScenarioById(prisma, scenarioId)

    if (!row) {
        throw new ProjectionScenarioServiceError(
            SCENARIO_ERROR_CODES.SCENARIO_NOT_FOUND,
            'Le scénario est introuvable.',
            {field: 'id', scenarioId},
        )
    }

    return rowToScenario(row)
}

async function createProjectionScenario(prisma, data) {
    const payload = buildProjectionScenarioPayload(data)

    await execute(prisma, insertScenarioSql(payload))

    return rowToScenario(await getRawScenarioByName(prisma, payload.name))
}

async function updateProjectionScenario(prisma, id, data) {
    const scenarioId = requireId(id)

    await getProjectionScenarioById(prisma, scenarioId)

    const payload = buildProjectionScenarioPayload(data, {partial: true})
    await execute(prisma, updateScenarioSql(scenarioId, payload))

    return getProjectionScenarioById(prisma, scenarioId)
}

async function deleteProjectionScenario(prisma, id) {
    const scenarioId = requireId(id)
    const scenario = await getProjectionScenarioById(prisma, scenarioId)

    if (scenario.isDefault) {
        await updateProjectionScenario(prisma, scenarioId, {isActive: false})
        return {ok: true, id: scenarioId, entityType: 'projectionScenario', deactivated: true}
    }

    await execute(prisma, `DELETE FROM "ProjectionScenario" WHERE "id" = ${sqlNumber(scenarioId)}`)

    return {ok: true, id: scenarioId, entityType: 'projectionScenario', deactivated: false}
}

function toProjectionScenarioIpcError(error) {
    if (error instanceof ProjectionScenarioServiceError) {
        return {
            code: error.code,
            message: error.message,
            field: error.field,
            scenarioId: error.scenarioId,
            details: error.details,
            recoverable: error.recoverable,
        }
    }

    return {
        code: 'unknownProjectionScenarioError',
        message: error?.message || 'Erreur inconnue pendant la gestion des scénarios.',
        field: null,
        scenarioId: null,
        details: null,
        recoverable: false,
    }
}

module.exports = {
    DB_TO_KIND,
    DEFAULT_SCENARIOS,
    KIND_TO_DB,
    SCENARIO_ERROR_CODES,
    SCENARIO_KINDS,
    ProjectionScenarioServiceError,
    buildProjectionScenarioPayload,
    createProjectionScenario,
    deleteProjectionScenario,
    ensureDefaultProjectionScenarios,
    getProjectionScenarioById,
    listProjectionScenarios,
    normalizeCurrency,
    normalizeHorizonMonths,
    normalizeOptionalRate,
    normalizeScenarioKind,
    rowToScenario,
    toProjectionScenarioIpcError,
    updateProjectionScenario,
}
