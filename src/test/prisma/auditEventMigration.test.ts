import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'

const migrationPath = path.resolve(
    process.cwd(),
    'prisma/migrations/20260510012000_add_audit_event/migration.sql',
)

describe('AuditEvent migration', () => {
    it('creates the audit table with required local columns and indexes', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8')

        expect(sql).toContain('CREATE TABLE "AuditEvent"')
        expect(sql).toContain('"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT')
        expect(sql).toContain('"eventType" TEXT NOT NULL')
        expect(sql).toContain('"timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP')
        expect(sql).toContain('"domain" TEXT NOT NULL')
        expect(sql).toContain('"action" TEXT NOT NULL')
        expect(sql).toContain('"severity" TEXT NOT NULL DEFAULT')
        expect(sql).toContain('"summary" TEXT NOT NULL')
        expect(sql).toContain('"entityIdsJson" TEXT NOT NULL DEFAULT')
        expect(sql).toContain('"metadataJson" TEXT')
        expect(sql).toContain('"source" TEXT NOT NULL DEFAULT')
        expect(sql).toContain('"status" TEXT NOT NULL DEFAULT')

        expect(sql).toContain('CREATE INDEX "AuditEvent_timestamp_idx"')
        expect(sql).toContain('CREATE INDEX "AuditEvent_eventType_idx"')
        expect(sql).toContain('CREATE INDEX "AuditEvent_severity_idx"')
        expect(sql).toContain('CREATE INDEX "AuditEvent_domain_idx"')
    })
})
