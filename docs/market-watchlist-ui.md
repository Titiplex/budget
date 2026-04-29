# Market watchlist UI

Issue #36 adds a compact market watchlist inside the wealth section.

## Scope

The UI is intentionally not a trading screen and does not claim real-time prices. It shows:

- followed instruments;
- last known local snapshot;
- quote currency;
- provider used for the snapshot;
- snapshot timestamp;
- freshness status;
- manual refresh result and provider errors.

## Data model

The watchlist uses `MarketInstrument.isActive` as the followed/not-followed flag. No extra watchlist table is required for the minimal implementation.

`PriceSnapshot` stays append-only and remains the source for the last known local price. When refresh fails, the UI still displays the previous snapshot and shows a provider/offline warning.

## Provider behavior

The default provider is `local`. It generates deterministic mock quotes so the app remains usable without network credentials or a real market-data provider.

A provider value of `offline`, `unavailable`, `disabled`, or `none` simulates provider failure. This keeps failure handling visible during development without adding real provider infrastructure.

## IPC surface

The renderer uses `window.marketData` exposed by preload:

- `listWatchlist()`
- `addWatchlistInstrument(input)`
- `removeWatchlistInstrument(id)`
- `refreshWatchlist(options?)`

Handlers live under `marketData:watchlist:*` and stay in Electron main.
