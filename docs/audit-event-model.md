# Critical operation audit event model

This document mirrors the migration-backed local audit model introduced for the security and recovery epic.

The audit log is intentionally local, minimal and non-intrusive. Its purpose is to answer what happened, when it happened, what domain was affected, what entities were involved, where the action came from and whether it succeeded.

## Storage

The local SQLite table is created by:

```text
prisma/migrations/20260510012000_add_audit_event/migration.sql
```

The runtime repository is:

```text
electron/audit/auditEventModel.js
```

The shared renderer/main-facing TypeScript contract is:

```text
src/types/audit.ts
```

## Logical Prisma model

The migration corresponds to this Prisma-compatible logical model:

```prisma
model AuditEvent {
  id            Int      @id @default(autoincrement())
  eventType     String
  timestamp     DateTime @default(now())
  domain        String
  action        String
  severity      String   @default("INFO")
  summary       String
  entityIdsJson String   @default("[]")
  metadataJson  String?
  source        String   @default("local")
  status        String   @default("SUCCESS")

  @@index([timestamp])
  @@index([eventType])
  @@index([severity])
  @@index([domain])
}
```

The repository currently uses parameterized SQL through Prisma instead of a generated Prisma delegate, so it works as soon as the migration exists and does not depend on a regenerated client exposing `prisma.auditEvent`.

## Event types

The initial event type set covers:

- `importApplied`
- `importCancelled`
- `importFailed`
- `backupExported`
- `encryptedBackupExported`
- `restoreDryRun`
- `restoreApplied`
- `restoreFailed`
- `criticalDelete`
- `bulkDelete`
- `secretCreated`
- `secretDeleted`
- `integrityCheckFailed`
- `migrationApplied`

## Metadata rule

`metadataJson` is for small diagnostic metadata only. It must not contain credentials, raw rows, full account payloads, full transaction payloads or complete financial exports.

The helper redacts common sensitive keys and values before persistence. This is a defensive guard, not a reason to pass large or sensitive payloads into the audit layer.
