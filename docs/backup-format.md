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
