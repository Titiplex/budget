# Budget backup JSON format

Budget uses a JSON backup as its canonical portable format. The root object keeps the same envelope across versions:

```json
{
  "kind": "budget-backup",
  "version": 6,
  "exportedAt": "2026-05-01T00:00:00.000Z",
  "data": {}
}
```

## Supported versions

The parser supports versions `2`, `3`, `4`, `5` and `6`.

Version `5` added goals and projections. Version `6` adds import pipeline data while keeping the existing core sections:

- `accounts`
- `categories`
- `budgetTargets`
- `recurringTemplates`
- `transactions`
- `taxProfiles`
- `financialGoals`
- `projectionScenarios`
- `projectionSettings`
- `importBackup`

Legacy versions are normalized with empty goal/projection/import arrays so older backups remain restorable.

## Encrypted local backup envelope

Encrypted local backups wrap the canonical JSON backup in a separate versioned envelope. The encrypted envelope is not a replacement for the canonical backup schema: after decryption, the plaintext must still parse as a normal `budget-backup` JSON document.

The initial encrypted format is:

```json
{
  "kind": "budget-encrypted-backup",
  "version": 1,
  "cipher": "aes-256-gcm",
  "kdf": {
    "name": "scrypt",
    "saltEncoding": "base64",
    "keyLength": 64,
    "N": 16384,
    "r": 8,
    "p": 1
  },
  "salt": "base64-random-salt",
  "nonce": "base64-random-nonce",
  "ciphertext": "base64-ciphertext",
  "authTag": "base64-authentication-tag",
  "keyCheck": "base64-password-check",
  "createdAt": "2026-05-01T00:00:00.000Z",
  "metadata": {
    "contentType": "application/json",
    "purpose": "local-backup-export"
  }
}
```

Properties:

- `salt` is random for each export and is used by `scrypt`.
- `nonce` is random for each export and is used by AES-GCM.
- `ciphertext` contains the encrypted canonical JSON backup.
- `authTag` authenticates the encrypted content and associated metadata.
- `keyCheck` lets the app fail clearly on a wrong password before attempting plaintext recovery.
- `metadata` must stay minimal and non-sensitive.

The encryption helper lives outside Vue and Prisma so encrypted export/restore flows can reuse it from Electron main without coupling it to UI state or database access.

## Goals

`data.financialGoals` stores user goals independently from database ids that may change during restore.

Required fields:

- `id`
- `name`
- `type`
- `targetAmount`
- `currency`
- `status`

Optional or nullable fields:

- `targetDate`
- `startingAmount`
- `priority`
- `notes`
- `trackedAssetId`
- `trackedPortfolioId`
- `trackedLiabilityId`
- `baselineNetWorthSnapshotId`

During restore, wealth links are intentionally detached for now. The backup preserves the raw ids for future migrations, but the restore recreates usable goals without assuming asset, portfolio, liability, or snapshot ids stayed stable.

## Projection scenarios

`data.projectionScenarios` stores configurable assumptions used by projections.

Fields:

- `id`
- `name`
- `kind`: `PESSIMISTIC`, `BASE`, `OPTIMISTIC`, or `CUSTOM`
- `description`
- `monthlySurplus`
- `annualGrowthRate`
- `annualInflationRate`
- `horizonMonths`
- `currency`
- `isDefault`
- `isActive`
- `notes`

Validation rejects negative monthly surplus, invalid currencies, invalid kinds, duplicate ids, and horizons outside `1..1200` months.

## Projection settings

`data.projectionSettings` stores lightweight UI/default settings when available:

- `currency`
- `defaultScenarioId`
- `horizonMonths`
- `manualMonthlyContribution`

On restore, `defaultScenarioId` is remapped to the newly created scenario id. If the referenced scenario cannot be recreated, it is set to `null`.

## Import backup extension

`data.importBackup` stores import-pipeline data introduced in backup version `6`.

Included:

- user mapping templates;
- known import sources;
- import audit history;
- reconciliation decisions;
- useful metadata such as file name, file hash, status, timestamps, errors, warnings and applied links.

Excluded:

- system templates and presets;
- real connector secrets or API tokens;
- PDF/OCR import data;
- rollback state;
- direct recreation of financial rows from import history.

Restore mode is audit-only for import history. Financial transactions/assets are restored from the canonical financial sections of the backup. Import history is restored only so the user can inspect past batches, decisions, errors and applied links.

The full import flow is documented in [`docs/import-pipeline.md`](import-pipeline.md).

## Simple exports

The goals backup helper also exposes simple user-facing exports:

- Markdown table via `exportFinancialGoalsMarkdown`
- semicolon-separated CSV via `exportFinancialGoalsCsv`

These are intentionally descriptive exports, not tax exports and not investment advice.
