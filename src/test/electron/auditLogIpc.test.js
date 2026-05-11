import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipc = {
    handle: vi.fn((channel, callback) => handlers.set(channel, callback)),
}

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerAuditLogHandlers',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // ignore
        }
    }
}

function installElectronMock() {
    Module._load = function loadWithMocks(request) {
        if (request === 'electron') {
            return {ipcMain: ipc}
        }
        return originalLoad.apply(this, arguments)
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipc.handle.mockClear()
    clearCommonJsCache()
})

describe('audit log IPC handlers', () => {
    it('exposes only explicit audit intents to the renderer', async () => {
        installElectronMock()
        const {AUDIT_LOG_IPC_CHANNELS, registerAuditLogHandlers} = require('../../../electron/ipc/registerAuditLogHandlers')
        const service = {
            logBackupExported: vi.fn(async (input) => ({id: 1, eventType: input.encrypted ? 'encryptedBackupExported' : 'backupExported'})),
            logRestoreDryRun: vi.fn(async () => ({id: 2, eventType: 'restoreDryRun'})),
            logRestoreApplied: vi.fn(async () => ({id: 3, eventType: 'restoreApplied'})),
            logRestoreFailed: vi.fn(async () => ({id: 4, eventType: 'restoreFailed'})),
            listAuditEvents: vi.fn(async () => []),
            exportAuditEventsMarkdown: vi.fn(async () => '# Historique de sécurité'),
            exportAuditEventsCsv: vi.fn(async () => 'date;type'),
            getRetentionPolicy: vi.fn(() => ({mode: 'keep-all', purgeSupported: false})),
        }

        registerAuditLogHandlers({ipc, service})

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            AUDIT_LOG_IPC_CHANNELS.BACKUP_EXPORTED,
            AUDIT_LOG_IPC_CHANNELS.RESTORE_DRY_RUN,
            AUDIT_LOG_IPC_CHANNELS.RESTORE_APPLIED,
            AUDIT_LOG_IPC_CHANNELS.RESTORE_FAILED,
            AUDIT_LOG_IPC_CHANNELS.LIST,
            AUDIT_LOG_IPC_CHANNELS.EXPORT_MARKDOWN,
            AUDIT_LOG_IPC_CHANNELS.EXPORT_CSV,
            AUDIT_LOG_IPC_CHANNELS.RETENTION_POLICY,
        ]))
        expect([...handlers.keys()]).not.toContain('audit:raw:create')

        const backup = await handlers.get(AUDIT_LOG_IPC_CHANNELS.BACKUP_EXPORTED)({}, {encrypted: true, filePath: '/tmp/backup.enc.json'})
        const policy = await handlers.get(AUDIT_LOG_IPC_CHANNELS.RETENTION_POLICY)({}, {})

        expect(backup).toEqual({ok: true, data: {id: 1, eventType: 'encryptedBackupExported'}, error: null})
        expect(policy).toEqual({ok: true, data: {mode: 'keep-all', purgeSupported: false}, error: null})
        expect(service.logBackupExported).toHaveBeenCalledWith({encrypted: true, filePath: '/tmp/backup.enc.json'})
    })

    it('lists and exports audit history through dedicated channels', async () => {
        installElectronMock()
        const {AUDIT_LOG_IPC_CHANNELS, registerAuditLogHandlers} = require('../../../electron/ipc/registerAuditLogHandlers')
        const service = {
            logBackupExported: vi.fn(),
            logRestoreDryRun: vi.fn(),
            logRestoreApplied: vi.fn(),
            logRestoreFailed: vi.fn(),
            listAuditEvents: vi.fn(async () => [{id: 1, eventType: 'restoreFailed'}]),
            exportAuditEventsMarkdown: vi.fn(async () => '# Historique de sécurité'),
            exportAuditEventsCsv: vi.fn(async () => 'date;type'),
            getRetentionPolicy: vi.fn(),
        }

        registerAuditLogHandlers({ipc, service})
        const filters = {eventType: 'restoreFailed', severity: 'ERROR', limit: 100}

        const listed = await handlers.get(AUDIT_LOG_IPC_CHANNELS.LIST)({}, filters)
        const markdown = await handlers.get(AUDIT_LOG_IPC_CHANNELS.EXPORT_MARKDOWN)({}, filters)
        const csv = await handlers.get(AUDIT_LOG_IPC_CHANNELS.EXPORT_CSV)({}, filters)

        expect(listed).toEqual({ok: true, data: [{id: 1, eventType: 'restoreFailed'}], error: null})
        expect(markdown).toEqual({ok: true, data: '# Historique de sécurité', error: null})
        expect(csv).toEqual({ok: true, data: 'date;type', error: null})
        expect(service.listAuditEvents).toHaveBeenCalledWith(filters)
        expect(service.exportAuditEventsMarkdown).toHaveBeenCalledWith(filters)
        expect(service.exportAuditEventsCsv).toHaveBeenCalledWith(filters)
    })

    it('returns structured IPC errors without throwing into renderer', async () => {
        installElectronMock()
        const {AUDIT_LOG_IPC_CHANNELS, registerAuditLogHandlers} = require('../../../electron/ipc/registerAuditLogHandlers')
        const service = {
            logBackupExported: vi.fn(async () => { throw new Error('audit unavailable') }),
            logRestoreDryRun: vi.fn(),
            logRestoreApplied: vi.fn(),
            logRestoreFailed: vi.fn(),
            listAuditEvents: vi.fn(),
            exportAuditEventsMarkdown: vi.fn(),
            exportAuditEventsCsv: vi.fn(),
            getRetentionPolicy: vi.fn(),
        }

        registerAuditLogHandlers({ipc, service})
        const result = await handlers.get(AUDIT_LOG_IPC_CHANNELS.BACKUP_EXPORTED)({}, {filePath: '/tmp/backup.json'})

        expect(result).toEqual({
            ok: false,
            data: null,
            error: {code: 'AUDIT_LOG_FAILED', message: 'audit unavailable'},
        })
    })
})
