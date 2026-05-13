const AUDIT_EVENT_TYPES = Object.freeze([
    'importApplied',
    'importCancelled',
    'importFailed',
    'backupExported',
    'encryptedBackupExported',
    'restoreDryRun',
    'restoreApplied',
    'restoreFailed',
    'recoverySnapshotCreated',
    'recoverySnapshotRestored',
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
    'recovery',
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

function isSafeCounterValue(value) {
    return typeof value === 'number' || typeof value === 'boolean'
}

function sanitizeMetadataValue(value, key = '', depth = 0) {
    if (shouldRedactKey(key) && !isSafeCounterValue(value)) return '[redacted]'
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

function toSqliteTimestamp(date) {
    return normalizeDate(date).toISOString()
}

function toAuditEventRecord(row) {
    return {
        id: Number(row.id),
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

function appendWhere(filters, where, params) {
    if (filters.eventType) {
        assertIncluded(filters.eventType, AUDIT_EVENT_TYPES, 'eventType')
        where.push('"eventType" = ?')
        params.push(filters.eventType)
    }
    if (filters.domain) {
        where.push('"domain" = ?')
        params.push(normalizeText(filters.domain))
    }
    if (filters.severity) {
        assertIncluded(filters.severity, AUDIT_EVENT_SEVERITIES, 'severity')
        where.push('"severity" = ?')
        params.push(filters.severity)
    }
    if (filters.status) {
        assertIncluded(filters.status, AUDIT_EVENT_STATUSES, 'status')
        where.push('"status" = ?')
        params.push(filters.status)
    }
    if (filters.from) {
        where.push('"timestamp" >= ?')
        params.push(toSqliteTimestamp(filters.from))
    }
    if (filters.to) {
        where.push('"timestamp" <= ?')
        params.push(toSqliteTimestamp(filters.to))
    }
}

function createAuditEventRepository(prisma) {
    if (!prisma) throw new Error('Prisma client is required.')

    return {
        async create(input) {
            const data = normalizeCreateAuditEventInput(input)
            await prisma.$executeRawUnsafe(
                `INSERT INTO "AuditEvent" ("eventType", "timestamp", "domain", "action", "severity", "summary", "entityIdsJson", "metadataJson", "source", "status") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                data.eventType,
                toSqliteTimestamp(data.timestamp),
                data.domain,
                data.action,
                data.severity,
                data.summary,
                data.entityIdsJson,
                data.metadataJson,
                data.source,
                data.status,
            )
            const rows = await prisma.$queryRawUnsafe(
                `SELECT "id", "eventType", "timestamp", "domain", "action", "severity", "summary", "entityIdsJson", "metadataJson", "source", "status" FROM "AuditEvent" WHERE "id" = last_insert_rowid() LIMIT 1`,
            )
            return toAuditEventRecord(rows[0])
        },
        async list(filters = {}) {
            const where = []
            const params = []
            appendWhere(filters, where, params)
            const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 500)
            const sql = [
                `SELECT "id", "eventType", "timestamp", "domain", "action", "severity", "summary", "entityIdsJson", "metadataJson", "source", "status"`,
                `FROM "AuditEvent"`,
                where.length ? `WHERE ${where.join(' AND ')}` : '',
                `ORDER BY "timestamp" DESC, "id" DESC`,
                `LIMIT ?`,
            ].filter(Boolean).join(' ')
            const rows = await prisma.$queryRawUnsafe(sql, ...params, limit)
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
