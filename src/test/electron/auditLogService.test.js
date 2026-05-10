import {describe, expect, it, vi} from 'vitest'

function loadAuditLogService() {
    return require('../../../electron/audit/auditLogService')
}

describe('AuditLogService', () => {
    it('records import, backup, restore and critical delete events through one service', async () => {
        const {createAuditLogService} = loadAuditLogService()
        const repository = {create: vi.fn(async (input) => ({id: repository.create.mock.calls.length, ...input}))}
        const service = createAuditLogService({repository, logger: {warn: vi.fn()}})

        await service.logImportApplied({batchId: 12, rowCount: 5, appliedCount: 4})
        await service.logBackupExported({filePath: '/tmp/budget-backup.json'})
        await service.logBackupExported({filePath: '/tmp/budget-backup.budget.enc.json', encrypted: true})
        await service.logRestoreDryRun({filePath: '/tmp/restore.json', report: {canApply: false, blockingErrors: ['missing account'], warnings: []}})
        await service.logRestoreApplied({filePath: '/tmp/restore.json', recoveryPath: '/tmp/pre-restore.json', counts: {accounts: 2}})
        await service.logCriticalDelete({domain: 'transaction', entityType: 'transaction', entityId: 44, metadata: {kind: 'EXPENSE'}})

        expect(repository.create).toHaveBeenCalledTimes(6)
        expect(repository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({eventType: 'importApplied', domain: 'import', action: 'apply'}))
        expect(repository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({eventType: 'backupExported', domain: 'backup', action: 'exportJson'}))
        expect(repository.create).toHaveBeenNthCalledWith(3, expect.objectContaining({eventType: 'encryptedBackupExported', domain: 'backup', action: 'exportEncrypted'}))
        expect(repository.create).toHaveBeenNthCalledWith(4, expect.objectContaining({eventType: 'restoreDryRun', status: 'BLOCKED', severity: 'WARNING'}))
        expect(repository.create).toHaveBeenNthCalledWith(5, expect.objectContaining({eventType: 'restoreApplied', severity: 'CRITICAL'}))
        expect(repository.create).toHaveBeenNthCalledWith(6, expect.objectContaining({eventType: 'criticalDelete', domain: 'transaction'}))
    })

    it('does not break non-strict operations when audit persistence fails', async () => {
        const {createAuditLogService} = loadAuditLogService()
        const logger = {warn: vi.fn()}
        const repository = {create: vi.fn(async () => { throw new Error('db down') })}
        const service = createAuditLogService({repository, logger})

        const result = await service.logBackupExported({filePath: '/tmp/backup.json'})

        expect(result).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith('[audit] write failed', expect.any(Error))
    })

    it('can be strict when traceability is required', async () => {
        const {createAuditLogService} = loadAuditLogService()
        const repository = {create: vi.fn(async () => { throw new Error('db down') })}
        const service = createAuditLogService({repository, logger: {warn: vi.fn()}})

        await expect(service.recordAuditEvent({
            eventType: 'restoreApplied',
            domain: 'restore',
            action: 'apply',
            summary: 'restore applied',
        }, {strict: true})).rejects.toThrow('db down')
    })

    it('exposes keep-all retention policy', () => {
        const {createAuditLogService} = loadAuditLogService()
        const service = createAuditLogService({repository: {create: vi.fn()}, logger: {warn: vi.fn()}})

        expect(service.getRetentionPolicy()).toMatchObject({
            mode: 'keep-all',
            purgeSupported: false,
        })
    })

    it('logs secret, migration and integrity events without raw values', async () => {
        const {createAuditLogService} = loadAuditLogService()
        const repository = {create: vi.fn(async (input) => input)}
        const service = createAuditLogService({repository, logger: {warn: vi.fn()}})

        await service.logSecretChange({action: 'create', key: 'provider:token', service: 'market-data'})
        await service.logMigration({name: '20260510012000_add_audit_event'})
        await service.logIntegrityCheck({ok: false, reason: 'checksum mismatch'})

        expect(repository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
            eventType: 'secretCreated',
            domain: 'secret',
            metadata: expect.not.objectContaining({value: expect.anything()}),
        }))
        expect(repository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({eventType: 'migrationApplied'}))
        expect(repository.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
            eventType: 'integrityCheckFailed',
            severity: 'ERROR',
            status: 'FAILED',
        }))
    })
})
