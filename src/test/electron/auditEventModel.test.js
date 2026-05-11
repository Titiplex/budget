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

    it('creates and lists chronological audit events through migration-backed SQL', async () => {
        const {createAuditEventRepository} = loadAuditEventModel()
        const rows = []
        const prisma = {
            $executeRawUnsafe: vi.fn(async (_sql, ...params) => {
                rows.push({
                    id: rows.length + 1,
                    eventType: params[0],
                    timestamp: params[1],
                    domain: params[2],
                    action: params[3],
                    severity: params[4],
                    summary: params[5],
                    entityIdsJson: params[6],
                    metadataJson: params[7],
                    source: params[8],
                    status: params[9],
                })
            }),
            $queryRawUnsafe: vi.fn(async (sql, ...params) => {
                if (sql.includes('last_insert_rowid')) return [rows[rows.length - 1]]
                expect(sql).toContain('FROM "AuditEvent"')
                expect(sql).toContain('ORDER BY "timestamp" DESC, "id" DESC')
                expect(params).toEqual(['backupExported', 10])
                return rows
                    .filter((row) => row.eventType === 'backupExported')
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            }),
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

        expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2)
        expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3)
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
