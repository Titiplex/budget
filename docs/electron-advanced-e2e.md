# Electron advanced E2E smoke flows

This suite covers the advanced local-first domains added after the core Electron smoke tests:

- wealth: portfolio, standalone asset, liability, consolidated net worth and generated snapshot;
- goals/projections: deterministic goal creation, custom projection scenario and manual monthly contribution estimate;
- imports: CSV fixture parsing, preview dry-run, row-level errors, duplicate detection, reconciliation/application links and import history;
- reports/import history/wealth UI navigation after the data has been created through renderer preload APIs.

## Command

```bash
npm run test:e2e:advanced
```

The command is also included in:

```bash
npm run test:e2e
```

## Isolation guarantees

The test creates a temporary SQLite database for every run and injects it through `BUDGET_DATABASE_PATH`. It also starts Electron with a temporary `--user-data-dir` so import audit history, logs and browser profile data do not touch the real user profile.

The database is initialized with `prisma db push --skip-generate` against the project schema before Electron starts.

## Fixtures

The CSV fixture lives at:

```text
src/test/e2e/fixtures/advanced-import.csv
```

It intentionally contains:

- valid transaction rows;
- an exact duplicate row;
- one invalid row with a bad date and invalid amount.

The import test asserts that the preview remains a dry-run and that applying the import workflow records reconciliation/application links without mutating the transaction table directly. That matches the current import workflow contract, where import history is audit/reconciliation-oriented and financial rows are not recreated from audit history alone.

## Failure diagnostics

On failure, the suite prints Electron stdout/stderr and captures a renderer screenshot through CDP. By default, temporary artifacts are deleted at the end of the run.

To keep the temporary DB, import history and screenshot artifacts:

```bash
BUDGET_E2E_KEEP_ARTIFACTS=1 npm run test:e2e:advanced
```

To override the Chrome DevTools Protocol port:

```bash
BUDGET_E2E_ADVANCED_CDP_PORT=9455 npm run test:e2e:advanced
```

## Boundaries

The suite does not call external market-data, bank, broker or cloud services. It does not open native file dialogs for JSON backup/restore because those flows are covered at unit/contract level and are fragile in headless Electron environments. The advanced backup/restore guarantee is still exercised indirectly by using the same rich domain data shape covered by the backup/restore regression fixtures.
