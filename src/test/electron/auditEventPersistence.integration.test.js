import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const { PrismaClient } = require('@prisma/client')
const {
  createAuditLogService,
} = require('../../../electron/audit/auditLogService')

// Exercise real SQL on a unique database, never the application singleton or .env URL.
describe('AuditEvent persistence on an isolated SQLite database', () => {
  it('applies the audit migration and returns the correct events for concurrent writes', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'budget-audit-test-'),
    )
    const databasePath = path.join(directory, 'audit.db').replace(/\\/g, '/')
    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${databasePath}` } },
    })
    try {
      const migration = fs.readFileSync(
        path.resolve(
          'prisma/migrations/20260510012000_add_audit_event/migration.sql',
        ),
        'utf8',
      )
      // This migration contains only CREATE TABLE / CREATE INDEX statements.
      for (const statement of migration
        .split(';')
        .map((sql) => sql.trim())
        .filter(Boolean)) {
        await prisma.$executeRawUnsafe(statement)
      }

      const logger = { warn: vi.fn() }
      const audit = createAuditLogService({ prisma, logger })
      await expect(audit.listAuditEvents()).resolves.toEqual([])

      const [imported, secret] = await Promise.all([
        audit.logImportApplied(
          { batchId: 12, rowCount: 2, appliedCount: 1 },
          { strict: true },
        ),
        audit.logSecretChange(
          { action: 'create', source: 'secret:save' },
          { strict: true },
        ),
      ])
      expect(imported).toMatchObject({
        eventType: 'importApplied',
        domain: 'import',
        status: 'SUCCESS',
      })
      expect(secret).toMatchObject({
        eventType: 'secretCreated',
        domain: 'secret',
        source: 'secret:save',
      })
      expect(secret.id).not.toBe(imported.id)

      const persisted = await audit.listAuditEvents({ domain: 'import' })
      expect(persisted).toHaveLength(1)
      expect(persisted[0]).toMatchObject({
        id: imported.id,
        eventType: 'importApplied',
        entityIds: [{ type: 'importBatch', id: 12 }],
        metadata: { rowCount: 2, appliedCount: 1 },
      })
      const all = await audit.listAuditEvents()
      expect(all).toHaveLength(2)
      expect(all).toEqual(expect.arrayContaining([imported, secret]))
      expect(logger.warn).not.toHaveBeenCalled()
    } finally {
      try {
        await prisma.$disconnect()
      } finally {
        fs.rmSync(directory, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        })
      }
    }
  })
})
