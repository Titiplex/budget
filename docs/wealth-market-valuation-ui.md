# Wealth market valuation UI

Issue #37 adds a renderer-level panel that makes market-data usage explicit in the Wealth screen.

## What is displayed

For each active Wealth asset, the panel tries to read the latest local `PriceSnapshot` through the existing `window.marketData.getLatestSnapshot` IPC API when the asset has a `marketInstrumentId`.

The row shows:

- the value used by the Wealth UI;
- the valuation source: market snapshot, manual fallback, or unavailable;
- the unit price used when a local snapshot exists;
- the snapshot date;
- quote currency and display currency;
- a freshness badge: fresh, stale, unavailable, provider error, or unknown.

Portfolios keep using their manual Wealth value for this issue. Portfolio holding analytics and historical performance are intentionally out of scope.

## Fallback order

1. Latest local market snapshot, when present.
2. Manual Wealth value, when present.
3. Unavailable row with a non-blocking message.

Provider or IPC failures are rendered as row-level errors. They do not throw through the Wealth screen and they do not prevent the existing net worth cards from remaining calculable.

## Currency behavior

The summary cards aggregate only rows matching the selected Wealth display currency. Rows in another currency remain visible in the table and are counted separately so the UI does not silently add incompatible currencies.
