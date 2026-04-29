# Market data TypeScript contracts

Issue #32 adds shared TypeScript contracts for market data before wiring IPC handlers, providers or watchlist UI.

## Scope

The contracts live in `src/types/marketData.ts` and are safe to import from both Electron main and the Vue renderer.

They cover:

- market instruments;
- price snapshots;
- provider metadata;
- provider quotes;
- refresh results;
- watchlist rows;
- valuation results;
- create/update payloads for instruments, snapshots and watchlist items.

## Naming choice

`src/types/wealth.ts` already contains a wealth-domain `PriceSnapshot` tied to holding lots. To avoid mixing the domains, the market-data contract exposes `MarketPriceSnapshot` as the preferred name and `PriceSnapshot` as a compatibility alias requested by the issue.

When a file imports both domains, prefer:

```ts
import type {PriceSnapshot as WealthPriceSnapshot} from './wealth'
import type {MarketPriceSnapshot} from './marketData'
```

## Provider errors

Provider failures are represented as structured `MarketDataProviderError` objects. IPC handlers should return these objects inside `MarketDataRefreshResult.errors` instead of leaking raw exceptions to the renderer.

The required statuses are represented by `ProviderErrorStatus`:

- `UNKNOWN_SYMBOL`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `UNSUPPORTED_CURRENCY`
- `INVALID_RESPONSE`

Additional generic statuses are available for transport and unknown failures:

- `NETWORK_ERROR`
- `TIMEOUT`
- `UNKNOWN_ERROR`

## Freshness / absence

`StalenessStatus` distinguishes:

- `MISSING`: no market data exists;
- `FRESH`: the quote is current enough for normal valuation;
- `STALE`: the quote is old but can still be shown as a fallback;
- `EXPIRED`: the quote is too old for trusted valuation but remains auditable;
- `UNKNOWN`: freshness cannot be determined.

This allows future UI and IPC code to avoid guessing whether `null` means absent, stale or failed.
