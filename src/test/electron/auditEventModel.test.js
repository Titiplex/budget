import {describe, expect, it, vi} from 'vitest'

function loadAuditEventModel() {
    return require('../../../electron/audit/auditEventModel')
}

describe('audit event model helpers', () => {
    it('covers critical event types required by the security epic', () => {
        const {AUDIT_EVENT_TYPES} = loadAuditEventModel()

        expect(AUDIT_EVENT_TYPES).toEqual(expect.arrayContaining([
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
        ]))
    })

    it('normalizes a valid audit event without storing raw secret or finance payloads', () => {
        const {normalizeCreateAuditEventInput} = loadAuditEventModel()

        const normalized = normalizeCreateAuditEventInput({
            eventType: 'restoreDryRun',
            domain: 'restore',
            action: 'preview',
            severity: 'WARNING',
            status: 'BLOCKED',
            summary: 'Restore dry-run blocked because references are invalid.',
            source: 'renderer-menu',
            timestamp: '2026-05-10T01:00:00.000Z',
            entityIds: [
                {type: 'backup', id: 'budget-backup.json'},
                {type: '', id: 123},
                {type: 'ignored'},
            ],
            metadata: {
                password: 'do-not-store',
                apiKey: 'do-not-store-either',
                accountRows: [{name: 'Checking', balance: 1200}],
                tokenHeader: 'Bearer abcdefghijklmnopqrstuvwxyz',
                counts: {accounts: 2, transactions: 10},
                safe: 'visible diagnostic',
            },
        })

        expect(normalized).toMatchObject({
            eventType: 'restoreDryRun',
            domain: 'restore',
            action: 'preview',
            severity: 'WARNING',
            status: 'BLOCKED',
            summary: 'Restore dry-run blocked because references are invalid.',
            source: 'renderer-menu',
        })
        expect(normalized.timestamp).toBeInstanceOf(Date)
        expect(JSON.parse(normalized.entityIdsJson)).toEqual([{type: 'backup', id: 'budget-backup.json'}])

        const metadata = JSON.parse(normalized.metadataJson)
        expect(metadata.password).toBe('[redacted]')
        expect(metadata.apiKey).toBe('[redacted]')
        expect(metadata.accountRows).toBe('[redacted]')
        expect(metadata.tokenHeader).toBe('[redacted]')
        expect(metadata.counts).toEqual({accounts: 2, transactions: 10})
        expect(metadata.safe).toBe('visible diagnostic')
    })

    it('rejects unknown types and missing required fields', () => {
        const {normalizeCreateAuditEventInput} = loadAuditEventModel()

        expect(() => normalizeCreateAuditEventInput({
            eventType: 'unknown',
            domain: 'backup',
            action: 'export',
            summary: 'x',
        })).toThrow(/eventType/)

        expect(() => normalizeCreateAuditEventInput({
            eventType: 'backupExported',
            domain: '',
            action: 'export',
            summary: 'x',
        })).toThrow(/domain/)

        expect(() => normalizeCreateAuditEventInput({
            eventType: 'backupExported',
            domain: 'backup',
            action: '',
            summary: 'x',
        })).toThrow(/action/)
    })

    it('creates and lists chronological audit events through a prisma-compatible repository', async () => {
        const {createAuditEventRepository} = loadAuditEventModel()
        const rows = []
        const prisma = {
            auditEvent: {
                create: vi.fn(async ({data}) => {
                    const row = {id: rows.length + 1, ...data}
                    rows.push(row)
                    return row
                }),
                findMany: vi.fn(async ({where, orderBy, take}) => {
                    expect(orderBy).toEqual({timestamp: 'desc'})
                    expect(take).toBe(10)
                    return rows
                        .filter((row) => !where.eventType || row.eventType === where.eventType)
                        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                }),
            },
        }
        const repo = createAuditEventRepository(prisma)

        await repo.create({
            eventType: 'backupExported',
            domain: 'backup',
            action: 'exportJson',
            summary: 'Plain JSON backup exported.',
            timestamp: '2026-05-10T01:00:00.000Z',
            entityIds: [{type: 'file', id: 'budget-backup.json'}],
            metadata: {format: 'json'},
        })
        await repo.create({
            eventType: 'restoreFailed',
            domain: 'restore',
            action: 'apply',
            severity: 'ERROR',
            status: 'FAILED',
            summary: 'Restore failed after recovery backup.',
            timestamp: '2026-05-10T02:00:00.000Z',
        })

        const listed = await repo.list({eventType: 'backupExported', limit: 10})

        expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2)
        expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {eventType: 'backupExported'},
        }))
        expect(listed).toEqual([
            expect.objectContaining({
                id: 1,
                eventType: 'backupExported',
                timestamp: '2026-05-10T01:00:00.000Z',
                entityIds: [{type: 'file', id: 'budget-backup.json'}],
                metadata: {format: 'json'},
            }),
        ])
    })
})
