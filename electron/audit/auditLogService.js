const {createAuditEventRepository} = require('./auditEventModel')
const {getPrisma} = require('../db')

function errorMessage(error) {
    if (!error) return null
    if (error instanceof Error && error.message) return error.message
    return String(error)
}

function metadata(value) {
    if (!value || typeof value !== 'object') return value || null
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).slice(0, 40))
}

function entity(type, id) {
    if (id == null || id === '') return null
    return {type, id}
}

function entities(items) {
    return (items || []).filter(Boolean)
}

function createAuditLogService({repository = null, prisma = null, logger = console} = {}) {
    const auditRepository = repository || createAuditEventRepository(prisma || getPrisma())

    async function recordAuditEvent(input, {strict = false} = {}) {
        try {
            return await auditRepository.create(input)
        } catch (error) {
            if (strict) throw error
            logger?.warn?.('[audit] write failed', error)
            return null
        }
    }

    async function logImportApplied(input = {}, options) {
        return recordAuditEvent({
            eventType: 'importApplied',
            domain: 'import',
            action: 'apply',
            severity: 'INFO',
            status: 'SUCCESS',
            summary: input.summary || `Import ${input.batchId || ''} appliqué.`.trim(),
            source: input.source || 'import-workflow',
            entityIds: entities([entity('importBatch', input.batchId)]),
            metadata: metadata({rowCount: input.rowCount, appliedCount: input.appliedCount, duplicateCount: input.duplicateCount, errorCount: input.errorCount}),
        }, options)
    }

    async function logImportFailed(input = {}, options) {
        return recordAuditEvent({
            eventType: 'importFailed',
            domain: 'import',
            action: input.action || 'apply',
            severity: 'ERROR',
            status: 'FAILED',
            summary: input.summary || `Import ${input.batchId || ''} échoué.`.trim(),
            source: input.source || 'import-workflow',
            entityIds: entities([entity('importBatch', input.batchId)]),
            metadata: metadata({reason: input.reason || errorMessage(input.error), stage: input.stage}),
        }, options)
    }

    async function logBackupExported(input = {}, options) {
        const encrypted = Boolean(input.encrypted)
        return recordAuditEvent({
            eventType: encrypted ? 'encryptedBackupExported' : 'backupExported',
            domain: 'backup',
            action: encrypted ? 'exportEncrypted' : 'exportJson',
            severity: 'INFO',
            status: 'SUCCESS',
            summary: encrypted ? 'Backup chiffré exporté.' : 'Backup JSON exporté.',
            source: input.source || 'backup-flow',
            entityIds: entities([entity('file', input.filePath || input.defaultPath)]),
            metadata: metadata({encrypted, format: encrypted ? 'encrypted-json' : 'json', backupVersion: input.backupVersion}),
        }, options)
    }

    async function logRestoreDryRun(input = {}, options) {
        const report = input.report || {}
        const canApply = report.canApply !== false && report.ok !== false
        return recordAuditEvent({
            eventType: 'restoreDryRun',
            domain: 'restore',
            action: 'dryRun',
            severity: canApply ? 'INFO' : 'WARNING',
            status: canApply ? 'SUCCESS' : 'BLOCKED',
            summary: canApply ? 'Dry-run de restauration validé.' : 'Dry-run de restauration bloqué.',
            source: input.source || 'restore-flow',
            entityIds: entities([entity('file', input.filePath)]),
            metadata: metadata({
                canApply,
                source: report.source,
                counts: report.counts,
                blockingErrorCount: Array.isArray(report.blockingErrors) ? report.blockingErrors.length : 0,
                warningCount: Array.isArray(report.warnings) ? report.warnings.length : 0,
                ignoredItemCount: Array.isArray(report.ignoredItems) ? report.ignoredItems.length : 0,
            }),
        }, options)
    }

    async function logRestoreApplied(input = {}, options) {
        return recordAuditEvent({
            eventType: 'restoreApplied',
            domain: 'restore',
            action: 'apply',
            severity: 'CRITICAL',
            status: 'SUCCESS',
            summary: 'Restauration de backup appliquée.',
            source: input.source || 'restore-flow',
            entityIds: entities([entity('file', input.filePath), entity('recoveryBackup', input.recoveryPath)]),
            metadata: metadata({counts: input.counts, recoveryBackupCreated: Boolean(input.recoveryPath)}),
        }, options)
    }

    async function logRestoreFailed(input = {}, options) {
        return recordAuditEvent({
            eventType: 'restoreFailed',
            domain: 'restore',
            action: input.action || 'apply',
            severity: 'ERROR',
            status: 'FAILED',
            summary: input.summary || 'Restauration de backup échouée.',
            source: input.source || 'restore-flow',
            entityIds: entities([entity('file', input.filePath), entity('recoveryBackup', input.recoveryPath)]),
            metadata: metadata({reason: input.reason || errorMessage(input.error), recoveryBackupCreated: Boolean(input.recoveryPath)}),
        }, options)
    }

    async function logCriticalDelete(input = {}, options) {
        const entityType = input.entityType || input.domain || 'entity'
        return recordAuditEvent({
            eventType: input.bulk ? 'bulkDelete' : 'criticalDelete',
            domain: input.domain || entityType,
            action: input.bulk ? 'bulkDelete' : 'delete',
            severity: input.severity || 'CRITICAL',
            status: input.status || 'SUCCESS',
            summary: input.summary || `${entityType} supprimé.`,
            source: input.source || 'main-process',
            entityIds: entities([entity(entityType, input.entityId), ...(Array.isArray(input.entityIds) ? input.entityIds : [])]),
            metadata: metadata(input.metadata),
        }, options)
    }

    async function logIntegrityCheck(input = {}, options) {
        const ok = input.ok !== false
        return recordAuditEvent({
            eventType: 'integrityCheckFailed',
            domain: 'integrity',
            action: input.action || 'check',
            severity: ok ? 'INFO' : 'ERROR',
            status: ok ? 'SUCCESS' : 'FAILED',
            summary: input.summary || (ok ? 'Contrôle d’intégrité réussi.' : 'Contrôle d’intégrité échoué.'),
            source: input.source || 'main-process',
            entityIds: entities(input.entityIds || []),
            metadata: metadata({reason: input.reason, ...input.metadata}),
        }, options)
    }

    async function logSecretChange(input = {}, options) {
        const deleted = input.action === 'delete' || input.action === 'clear'
        return recordAuditEvent({
            eventType: deleted ? 'secretDeleted' : 'secretCreated',
            domain: 'secret',
            action: deleted ? 'delete' : 'create',
            severity: 'WARNING',
            status: input.status || 'SUCCESS',
            summary: deleted ? 'Secret local supprimé.' : 'Secret local créé ou remplacé.',
            source: input.source || 'secret-store',
            entityIds: entities([entity('secretKey', input.key), entity('service', input.service)]),
            metadata: metadata({provider: input.provider, clearedCount: input.clearedCount}),
        }, options)
    }

    async function logMigration(input = {}, options) {
        return recordAuditEvent({
            eventType: 'migrationApplied',
            domain: 'migration',
            action: input.action || 'apply',
            severity: input.status === 'FAILED' ? 'ERROR' : 'INFO',
            status: input.status || 'SUCCESS',
            summary: input.summary || `Migration ${input.name || ''} appliquée.`.trim(),
            source: input.source || 'prisma',
            entityIds: entities([entity('migration', input.name)]),
            metadata: metadata({version: input.version}),
        }, options)
    }

    function getRetentionPolicy() {
        return {
            mode: 'keep-all',
            purgeSupported: false,
            description: 'Tous les événements locaux sont conservés par défaut. Une purge contrôlée pourra être ajoutée plus tard.',
        }
    }

    return {
        getRetentionPolicy,
        logBackupExported,
        logCriticalDelete,
        logImportApplied,
        logImportFailed,
        logIntegrityCheck,
        logMigration,
        logRestoreApplied,
        logRestoreDryRun,
        logRestoreFailed,
        logSecretChange,
        recordAuditEvent,
    }
}

module.exports = {
    createAuditLogService,
}
