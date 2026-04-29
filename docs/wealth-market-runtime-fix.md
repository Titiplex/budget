# Wealth / Market data runtime fix

## Symptoms

- `Wealth IPC is not available.` in the Wealth screen.
- `listWatchlist is not a function` in the market watchlist.
- `The table main.MarketInstrument does not exist in the current database.` when the market valuation panel loads.

## Cause

`electron/preload.js` exposed `marketData` twice. Electron refuses to bind the same global API twice, so the second bind aborts preload execution. The first `window.marketData` object is left available, but without the watchlist methods, and the later `window.wealth` exposure is never reached.

The missing `MarketInstrument` table is a separate database sync issue: the Prisma schema contains the market data models, but the existing local SQLite development database was created before those tables were added.

## Fix

1. Keep a single `contextBridge.exposeInMainWorld('marketData', ...)` block containing both base market-data methods and watchlist methods.
2. Sync the local development database after pulling the branch:

```bash
npm run db:push
```

Then restart the Electron app.

For a packaged app using a persistent userData database, a one-off migration or backup/restore flow is needed instead of deleting the user database blindly.
