const AUDIT_EVENT_TYPES = Object.freeze([
    'importApplied',
    'importCancelled',
    'importFailed',
    'backupExported',
    'encryptedBackupExported',
    'restoreDryRun',
    'restoreApplied',
    'restoreFailed',
    'criticalDelete',
    'bulkDelete',
    'secretCreated',
    'secretDeleted',
    'integrityCheckFailed',
    'migrationApplied',
])

const AUDIT_EVENT_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL'])
const AUDIT_EVENT_STATUSES = Object.freeze(['SUCCESS', 'FAILED', 'CANCELLED', 'BLOCKED'])
const AUDIT_EVENT_DOMAINS = Object.freeze([
    'import',
    'backup',
    'restore',
    'transaction',
    'account',
    'category',
    'budget',
    'recurring',
    'wealth',
    'secret',
    'integrity',
    'migration',
    'system',
])

const BLOCKED_METADATA_KEY_PATTERNS = [
    /secret/i,
    /password/i,
    /token/i,
    /api[_-]?key/i,
    /authorization/i,
    /credential/i,
    /rawRows?/i,
    /rawJson/i,
    /normalizedRows?/i,
    /transactions?/i,
    /accounts?/i,
    /bank/i,
    /iban/i,
    /card/i,
]

const BLOCKED_METADATA_VALUE_PATTERNS = [
    /bearer\s+[a-z0-9._-]+/i,
    /sk-[a-z0-9_-]{10,}/i,
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
]

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertIncluded(value, allowed, fieldName) {
    if (!allowed.includes(value)) {
        throw new Error(`${fieldName} invalide: ${value}`)
    }
    return value
}

function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    return trimmed || fallback
}

function normalizeDate(value) {
    if (value == null) return new Date()
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error('timestamp invalide')
    return date
}

function shouldRedactKey(key) {
    return BLOCKED_METADATA_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function shouldRedactValue(value) {
    return typeof value === 'string' && BLOCKED_METADATA_VALUE_PATTERNS.some((pattern) => pattern.test(value))
}

function sanitizeMetadataValue(value, key = '', depth = 0) {
    if (shouldRedactKey(key)) return '[redacted]'
    if (depth > 4) return '[truncated]'
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'string') return shouldRedactValue(value) ? '[redacted]' : value.slice(0, 500)
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadataValue(item, key, depth + 1))
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 50)
                .map(([childKey, childValue]) => [childKey, sanitizeMetadataValue(childValue, childKey, depth + 1)]),
        )
    }
    return String(value).slice(0, 500)
}

function sanitizeAuditMetadata(metadata) {
    if (metadata == null) return null
    if (!isRecord(metadata)) return {value: sanitizeMetadataValue(metadata)}
    return sanitizeMetadataValue(metadata)
}

function normalizeEntityIds(entityIds) {
    if (!Array.isArray(entityIds)) return []
    return entityIds
        .filter((item) => isRecord(item) && normalizeText(item.type) && (typeof item.id === 'string' || typeof item.id === 'number'))
        .slice(0, 100)
        .map((item) => ({type: normalizeText(item.type), id: item.id}))
}

function serializeJson(value) {
    return JSON.stringify(value ?? null)
}

function parseJson(value, fallback) {
    if (value == null || value === '') return fallback
    try {
        return JSON.parse(value)
    } catch (_error) {
        return fallback
    }
}

function normalizeCreateAuditEventInput(input) {
    if (!isRecord(input)) throw new Error('Audit event input must be an object.')

    const eventType = assertIncluded(input.eventType, AUDIT_EVENT_TYPES, 'eventType')
    const severity = assertIncluded(input.severity || 'INFO', AUDIT_EVENT_SEVERITIES, 'severity')
    const status = assertIncluded(input.status || 'SUCCESS', AUDIT_EVENT_STATUSES, 'status')
    const domain = normalizeText(input.domain)
    const action = normalizeText(input.action)
    const summary = normalizeText(input.summary)

    if (!domain) throw new Error('domain est obligatoire.')
    if (!action) throw new Error('action est obligatoire.')
    if (!summary) throw new Error('summary est obligatoire.')

    return {
        eventType,
        timestamp: normalizeDate(input.timestamp),
        domain,
        action,
        severity,
        summary: summary.slice(0, 1000),
        entityIdsJson: serializeJson(normalizeEntityIds(input.entityIds)),
        metadataJson: input.metadata == null ? null : serializeJson(sanitizeAuditMetadata(input.metadata)),
        source: normalizeText(input.source, 'local').slice(0, 120),
        status,
    }
}

function toAuditEventRecord(row) {
    return {
        id: row.id,
        eventType: row.eventType,
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString(),
        domain: row.domain,
        action: row.action,
        severity: row.severity,
        summary: row.summary,
        entityIds: parseJson(row.entityIdsJson, []),
        metadata: parseJson(row.metadataJson, null),
        source: row.source,
        status: row.status,
    }
}

function createAuditEventRepository(prisma) {
    if (!prisma) throw new Error('Prisma client is required.')

    return {
        async create(input) {
            const data = normalizeCreateAuditEventInput(input)
            const row = await prisma.auditEvent.create({data})
            return toAuditEventRecord(row)
        },
        async list(filters = {}) {
            const where = {}
            if (filters.eventType) where.eventType = filters.eventType
            if (filters.domain) where.domain = filters.domain
            if (filters.severity) where.severity = filters.severity
            if (filters.status) where.status = filters.status
            if (filters.from || filters.to) {
                where.timestamp = {}
                if (filters.from) where.timestamp.gte = normalizeDate(filters.from)
                if (filters.to) where.timestamp.lte = normalizeDate(filters.to)
            }
            const rows = await prisma.auditEvent.findMany({
                where,
                orderBy: {timestamp: 'desc'},
                take: Math.min(Math.max(Number(filters.limit || 100), 1), 500),
            })
            return rows.map(toAuditEventRecord)
        },
    }
}

module.exports = {
    AUDIT_EVENT_DOMAINS,
    AUDIT_EVENT_SEVERITIES,
    AUDIT_EVENT_STATUSES,
    AUDIT_EVENT_TYPES,
    createAuditEventRepository,
    normalizeCreateAuditEventInput,
    sanitizeAuditMetadata,
    toAuditEventRecord,
}
