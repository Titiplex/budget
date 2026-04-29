# Market valuation service

Issue #34 adds the offline business layer that sits between persisted market-data snapshots and the wealth domain.

## Goals

The service must value market-aware assets without coupling Vue or the wealth overview directly to an external quote provider.

The supported fallback order is deliberately simple:

1. latest usable local `PriceSnapshot`;
2. manual value already stored on the wealth entity;
3. unavailable valuation with a structured business error.

A stale snapshot is still usable. It is never silently treated as fresh.

## Files

- `electron/marketData/priceSnapshotRepository.js`
  - writes normalized `PriceSnapshot` rows;
  - reads snapshots by instrument or holding lot;
  - returns the latest usable snapshot;
  - updates the `MarketInstrument` current-price cache when writing an instrument snapshot.
- `electron/marketData/valuationService.js`
  - calculates position, asset, and holding-lot valuations;
  - applies the fallback chain;
  - converts quote currency to display currency when needed;
  - returns structured results instead of throwing into the UI layer.
- `electron/marketData/fxConversion.js`
  - handles same-currency conversion offline;
  - supports injected static rates;
  - supports an injected resolver compatible with the existing `getHistoricalQuote` handler shape.
- `electron/marketData/valuationErrors.js`
  - normalizes business errors such as missing snapshots, invalid quantities, and unavailable FX rates.

## Snapshot freshness

The database enum is `MarketPriceFreshnessStatus`:

- `FRESH`
- `STALE`
- `UNKNOWN`
- `UNAVAILABLE`
- `ERROR`

The service-facing status maps unavailable/error rows to `MISSING`, keeps stale rows as `STALE`, and can downgrade old fresh rows to stale using `staleAfterHours` from `MarketInstrument` or a service option.

## Valuation result shape

The result includes both display and native values:

```js
{
  entityType: 'holdingLot',
  entityId: 5,
  instrumentId: 10,
  quantity: 3,
  source: 'SNAPSHOT',
  mode: 'LATEST_PRICE',
  unitPrice: 100,
  quoteCurrency: 'USD',
  nativeMarketValue: 300,
  displayCurrency: 'CAD',
  marketValue: 405,
  stalenessStatus: 'FRESH',
  usedSnapshot: { id: 1 },
  fxRate: { from: 'USD', to: 'CAD', rate: 1.35 },
  error: null,
  warnings: []
}
```

When FX is missing, the service preserves `nativeMarketValue`, sets `marketValue` to `null`, and returns an `FX_RATE_UNAVAILABLE` error. That keeps the global wealth screen resilient: one unconvertible quote does not break the rest of the portfolio.

## Integration notes

For a Prisma-backed Electron main service:

```js
const {getPrisma} = require('../db')
const {createMarketValuationService} = require('../marketData')
const {getHistoricalQuote} = require('../ipc/registerFxHandlers')

const valuationService = createMarketValuationService({
  prisma: getPrisma(),
  fxRateResolver: getHistoricalQuote,
})
```

For tests or fully offline mode, inject static rates:

```js
const valuationService = createMarketValuationService({
  prisma,
  fxRates: {
    'USD:CAD': 1.35,
    'EUR:CAD': {rate: 1.47, provider: 'manual-test'},
  },
})
```

The renderer should consume the result as data. It should not retry providers, query Prisma, or infer freshness itself.
