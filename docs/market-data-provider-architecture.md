# Market data provider architecture

Issue #33 introduces the Electron-main provider boundary for market data. The goal is to make the market-data engine depend on an app-owned contract instead of depending directly on a future external API SDK.

## Modules

- `electron/marketData/providerRegistry.js`: registers providers, stores the active provider id, exposes provider runtime state, and applies failure / cooldown rules.
- `electron/marketData/mockProvider.js`: local provider used by tests and development. It never performs network calls.
- `electron/marketData/quoteNormalizer.js`: converts provider-specific quote payloads into the app’s internal quote and snapshot shape.
- `electron/marketData/providerErrors.js`: maps provider, HTTP, network, timeout and validation failures to structured app errors.
- `electron/marketData/marketDataService.js`: orchestration layer used by future IPC handlers. It requests quotes through the registry, normalizes results, and returns fallback snapshots when a provider fails.
- `electron/marketData/index.js`: single entry point for Electron main code.

## Provider contract

A provider is a plain object registered in the Electron main process:

```js
{
  id: 'mock-local',
  name: 'Mock local market data provider',
  enabled: true,
  supportsSearch: true,
  supportsBatchQuotes: true,
  supportsHistoricalQuotes: false,
  supportedInstrumentTypes: ['EQUITY', 'ETF', 'CASH', 'CRYPTO', 'OTHER'],
  supportedCurrencies: null,
  priority: 1,
  rateLimit: null,
  async getQuotes(requests, context) {
    return {quotes: [], errors: []}
  },
  async search(query) {
    return []
  },
}
```

Only `id`, `name`, and `getQuotes` are mandatory. A real provider can be added later by registering another object with the same contract. Business logic should call `marketDataService.refreshQuotes(...)` instead of importing a provider SDK directly.

## Active provider configuration

The registry owns this runtime config:

```js
{
  activeProviderId: 'mock-local',
  timeoutMs: 5000,
  maxFailuresBeforeCooldown: 3,
  failureCooldownMs: 60000,
  rateLimitCooldownMs: 60000,
}
```

This keeps provider selection outside the valuation logic. Future settings UI or IPC code can read and update this config without changing the provider implementation.

## Error strategy

Provider errors are returned as app-level objects:

- `UNKNOWN_SYMBOL`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `UNSUPPORTED_CURRENCY`
- `INVALID_RESPONSE`
- `NETWORK_ERROR`
- `TIMEOUT`
- `UNKNOWN_ERROR`

Raw provider exceptions are normalized before they cross the service boundary. Recoverable failures such as timeout, network error, rate-limit and provider outage mark the provider as failed. Repeated failures or rate-limit responses put the provider in cooldown so the app can avoid hammering a broken provider.

## Fallback strategy

`refreshQuotes` accepts `fallbackSnapshots`. If the active provider fails, the service returns a `FAILED` refresh result with structured errors and the matching fallback snapshots in `snapshots`, plus `usedFallback: true`.

That means the app can keep displaying the last local snapshot while still showing that the refresh itself failed. No trading, streaming, periodic refresh, or tick-by-tick data is introduced here.
