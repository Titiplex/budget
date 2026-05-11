const fs = require('node:fs/promises')
const path = require('node:path')
const {createAuditLogService} = require('../audit/auditLogService')

const DEFAULT_MAX_SNAPSHOTS = 20
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024
const SNAPSHOT_DIR_NAME = 'recovery-snapshots'
const SECRET_KEY_RE = /secret|password|token|api[-_]?key|authorization|credential/i

function safeOperation(value) {
    return String(value || 'operation')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'operation'
}

function snapshotTimestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scrubSecrets(value) {
    if (Array.isArray(value)) return value.map(scrubSecrets)
    if (!isRecord(value)) return value
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !SECRET_KEY_RE.test(key))
            .map(([key, entry]) => [key, scrubSecrets(entry)]),
    )
}

function sanitizeJsonContent(content) {
    const text = String(content || '')
    try {
        const parsed = JSON.parse(text)
        return `${JSON.stringify(scrubSecrets(parsed), null, 2)}\n`
    } catch (_error) {
        return text
    }
}

async function pathExists(filePath) {
    try {
        await fs.access(filePath)
        return true
    } catch (_error) {
        return false
    }
}

async function ensureDir(dir) {
    await fs.mkdir(dir, {recursive: true})
}

async function fileSize(filePath) {
    try {
        const stat = await fs.stat(filePath)
        return stat.size
    } catch (_error) {
        return 0
    }
}

function metadataPathFor(snapshotPath) {
    return `${snapshotPath}.meta.json`
}

function createRecoverySnapshotService({app, auditLog = createAuditLogService(), clock = () => new Date(), logger = console, policy = {}} = {}) {
    if (!app || typeof app.getPath !== 'function') throw new Error('Electron app is required for recovery snapshots')
    const maxSnapshots = Number.isInteger(policy.maxSnapshots) && policy.maxSnapshots > 0 ? policy.maxSnapshots : DEFAULT_MAX_SNAPSHOTS
    const maxBytes = Number.isFinite(policy.maxBytes) && policy.maxBytes > 0 ? policy.maxBytes : DEFAULT_MAX_BYTES

    function directory() {
        return path.join(app.getPath('userData'), SNAPSHOT_DIR_NAME)
    }

    async function listSnapshots() {
        const dir = directory()
        await ensureDir(dir)
        const entries = await fs.readdir(dir).catch(() => [])
        const metadataFiles = entries.filter((entry) => entry.endsWith('.meta.json'))
        const rows = []

        for (const metaFile of metadataFiles) {
            const metaPath = path.join(dir, metaFile)
            try {
                const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'))
                const snapshotPath = metadata.filePath || path.join(dir, metaFile.replace(/\.meta\.json$/, ''))
                if (!(await pathExists(snapshotPath))) continue
                const sizeBytes = await fileSize(snapshotPath)
                rows.push({...metadata, filePath: snapshotPath, metadataPath: metaPath, sizeBytes})
            } catch (error) {
                logger?.warn?.('[recovery] invalid metadata skipped', metaPath, error)
            }
        }

        return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    }

    async function pruneSnapshots() {
        const rows = await listSnapshots()
        let remaining = [...rows]
        let totalSize = remaining.reduce((sum, row) => sum + Number(row.sizeBytes || 0), 0)
        const toDelete = []

        while (remaining.length > maxSnapshots) {
            const removed = remaining.pop()
            if (removed) {
                toDelete.push(removed)
                totalSize -= Number(removed.sizeBytes || 0)
            }
        }

        while (remaining.length && totalSize > maxBytes) {
            const removed = remaining.pop()
            if (removed) {
                toDelete.push(removed)
                totalSize -= Number(removed.sizeBytes || 0)
            }
        }

        for (const row of toDelete) {
            await fs.rm(row.filePath, {force: true}).catch(() => null)
            await fs.rm(row.metadataPath || metadataPathFor(row.filePath), {force: true}).catch(() => null)
        }

        return {deletedCount: toDelete.length, retainedCount: remaining.length, maxSnapshots, maxBytes}
    }

    async function createSnapshot(input = {}) {
        const content = sanitizeJsonContent(input.content)
        if (!content.trim()) throw new Error('Recovery snapshot content is required')
        const createdAt = clock().toISOString()
        const operationType = safeOperation(input.operationType)
        const id = `recovery-${snapshotTimestamp(new Date(createdAt))}-${operationType}`
        const fileName = `${id}.json`
        const dir = directory()
        await ensureDir(dir)
        const filePath = path.join(dir, fileName)
        await fs.writeFile(filePath, content, 'utf8')
        const sizeBytes = await fileSize(filePath)
        const metadata = {
            id,
            fileName,
            filePath,
            createdAt,
            operationType,
            reason: String(input.reason || 'unspecified'),
            source: String(input.source || 'renderer'),
            sizeBytes,
        }
        const metadataPath = metadataPathFor(filePath)
        await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
        const retention = await pruneSnapshots()

        await auditLog.recordAuditEvent({
            eventType: 'recoverySnapshotCreated',
            domain: 'recovery',
            action: 'createSnapshot',
            severity: 'WARNING',
            status: 'SUCCESS',
            summary: `Snapshot de récupération créé avant ${operationType}.`,
            source: metadata.source,
            entityIds: [{type: 'recoverySnapshot', id}],
            metadata: {operationType, reason: metadata.reason, fileName, sizeBytes, retention},
        })

        return {...metadata, retention}
    }

    async function readSnapshot(id) {
        const snapshot = (await listSnapshots()).find((row) => row.id === id || row.fileName === id)
        if (!snapshot) throw new Error('Snapshot de récupération introuvable.')
        const content = await fs.readFile(snapshot.filePath, 'utf8')
        return {metadata: snapshot, content}
    }

    async function deleteSnapshot(id) {
        const snapshot = (await listSnapshots()).find((row) => row.id === id || row.fileName === id)
        if (!snapshot) return {deleted: false}
        await fs.rm(snapshot.filePath, {force: true}).catch(() => null)
        await fs.rm(snapshot.metadataPath || metadataPathFor(snapshot.filePath), {force: true}).catch(() => null)
        return {deleted: true, id: snapshot.id}
    }

    async function markRestored(input = {}) {
        await auditLog.recordAuditEvent({
            eventType: 'recoverySnapshotRestored',
            domain: 'recovery',
            action: 'restoreSnapshot',
            severity: 'CRITICAL',
            status: 'SUCCESS',
            summary: 'Snapshot de récupération chargé dans le flow de restauration.',
            source: input.source || 'renderer',
            entityIds: [{type: 'recoverySnapshot', id: input.id || input.filePath || 'unknown'}],
            metadata: {filePath: input.filePath || null},
        })
        return {ok: true}
    }

    function getRetentionPolicy() {
        return {maxSnapshots, maxBytes, directory: directory()}
    }

    return {
        createSnapshot,
        deleteSnapshot,
        getRetentionPolicy,
        listSnapshots,
        markRestored,
        pruneSnapshots,
        readSnapshot,
    }
}

module.exports = {
    DEFAULT_MAX_BYTES,
    DEFAULT_MAX_SNAPSHOTS,
    SNAPSHOT_DIR_NAME,
    createRecoverySnapshotService,
    scrubSecrets,
    sanitizeJsonContent,
}
