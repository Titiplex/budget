# Budget backup JSON format

Budget uses a JSON backup as its canonical portable format. The root object keeps the same envelope across versions:

```json
{
  "kind": "budget-backup",
  "version": 5,
  "exportedAt": "2026-05-01T00:00:00.000Z",
  "data": {}
}
```

## Supported versions

The parser supports versions `2`, `3`, `4` and `5`.

Version `5` adds goals and projections while keeping the existing core sections:

- `accounts`
- `categories`
- `budgetTargets`
- `recurringTemplates`
- `transactions`
- `taxProfiles`
- `financialGoals`
- `projectionScenarios`
- `projectionSettings`

Legacy versions are normalized with empty goal/projection arrays so older backups remain restorable.

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

## Simple exports

The goals backup helper also exposes simple user-facing exports:

- Markdown table via `exportFinancialGoalsMarkdown`
- semicolon-separated CSV via `exportFinancialGoalsCsv`

These are intentionally descriptive exports, not tax exports and not investment advice.
