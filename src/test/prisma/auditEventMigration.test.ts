import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'

const migrationPath = path.resolve(
    process.cwd(),
    'prisma/migrations/20260510012000_add_audit_event/migration.sql',
)

const schemaPath = path.resolve(
    process.cwd(),
    'prisma/schema.prisma',
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

    it('keeps AuditEvent in the Prisma schema for db push based E2E databases', () => {
        const schema = fs.readFileSync(schemaPath, 'utf8')

        expect(schema).toContain('model AuditEvent')
        expect(schema).toContain('eventType     String')
        expect(schema).toContain('timestamp     DateTime @default(now())')
        expect(schema).toContain('domain        String')
        expect(schema).toContain('action        String')
        expect(schema).toContain('entityIdsJson String   @default("[]")')
        expect(schema).toContain('metadataJson  String?')
        expect(schema).toContain('@@index([timestamp])')
        expect(schema).toContain('@@index([eventType])')
        expect(schema).toContain('@@index([severity])')
        expect(schema).toContain('@@index([domain])')
    })
})
