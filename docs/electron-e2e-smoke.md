# Electron E2E smoke tests

The Electron smoke suite is intentionally small and deterministic. It exercises the renderer/preload/main boundary with a temporary SQLite database instead of a real user profile.

## Run

```bash
npm run test:e2e:smoke
```

The script already runs `prisma generate`, builds the renderer, creates a fresh temporary database, applies the Prisma schema with `prisma db push`, starts Electron with `BUDGET_DATABASE_PATH`, then drives the renderer through the Chrome DevTools Protocol.

## Covered flows

The core smoke currently verifies:

- Electron launches and exposes a CDP page target.
- The renderer finishes loading.
- Preload APIs are available.
- `versions.ping()` reaches Electron main.
- The isolated E2E database starts empty.
- Main navigation can activate the core sections.
- Account creation persists through `window.db.account`.
- Category creation persists through `window.db.category`.
- Transaction creation, edit and delete persist through `window.db.transaction`.
- Budget creation persists through `window.db.budgetTarget`.
- Recurring template creation and due generation persist through `window.db.recurringTemplate`.
- Reports render rows produced by the generated recurring transactions.
- Backup/restore related preload contracts are present without opening native file dialogs.

The backup export/restore UI opens native file dialogs. The smoke therefore checks the preload/file contracts in this suite and leaves full backup/restore behavior to the unit/regression tests around JSON backup and dry-run restore.

## Isolation guarantees

Every run uses a database under a newly created temporary directory. The real user database is not read or written. The harness removes the directory at the end of a successful run.

To keep artifacts after a failure:

```bash
BUDGET_E2E_KEEP_ARTIFACTS=1 npm run test:e2e:smoke
```

The harness writes a screenshot and Electron logs under the run's temporary `artifacts` folder before failing.

## Conventions

Keep E2E assertions focused on user-visible behavior and stable contracts. Avoid pixel-perfect or style assertions. Prefer stable text, navigation markers and public preload APIs. Use unit tests for formula details and parser edge cases.
