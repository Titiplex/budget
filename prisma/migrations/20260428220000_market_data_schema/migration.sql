-- Epic 3 / #31: local market-data schema and cacheable price snapshots.
-- This migration keeps existing manual HoldingLot price snapshots, then adds
-- market instruments as an optional normalized layer above Wealth positions.

CREATE TABLE "MarketInstrument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instrumentKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "instrumentType" TEXT NOT NULL DEFAULT 'OTHER',
    "exchange" TEXT,
    "quoteCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "provider" TEXT,
    "providerInstrumentId" TEXT,
    "currentPrice" REAL,
    "currentPriceCurrency" TEXT,
    "currentPriceQuotedAt" DATETIME,
    "currentPriceProvider" TEXT,
    "freshnessStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "freshnessCheckedAt" DATETIME,
    "staleAfterHours" INTEGER NOT NULL DEFAULT 24,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

ALTER TABLE "Asset" ADD COLUMN "marketInstrumentId" INTEGER REFERENCES "MarketInstrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HoldingLot" ADD COLUMN "marketInstrumentId" INTEGER REFERENCES "MarketInstrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PriceSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "unitPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "pricedAt" DATETIME NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "freshnessStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "holdingLotId" INTEGER,
    "marketInstrumentId" INTEGER,
    CONSTRAINT "PriceSnapshot_holdingLotId_fkey" FOREIGN KEY ("holdingLotId") REFERENCES "HoldingLot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceSnapshot_marketInstrumentId_fkey" FOREIGN KEY ("marketInstrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_PriceSnapshot" (
    "id",
    "unitPrice",
    "currency",
    "pricedAt",
    "provider",
    "source",
    "freshnessStatus",
    "retrievedAt",
    "note",
    "createdAt",
    "updatedAt",
    "holdingLotId"
)
SELECT
    "id",
    "unitPrice",
    "currency",
    "pricedAt",
    CASE
        WHEN "source" = 'API' THEN 'api'
        WHEN "source" = 'IMPORTED' THEN 'imported'
        ELSE 'manual'
    END,
    "source",
    'UNKNOWN',
    "createdAt",
    "note",
    "createdAt",
    "updatedAt",
    "holdingLotId"
FROM "PriceSnapshot";

DROP TABLE "PriceSnapshot";
ALTER TABLE "new_PriceSnapshot" RENAME TO "PriceSnapshot";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "MarketInstrument_instrumentKey_key" ON "MarketInstrument"("instrumentKey");
CREATE UNIQUE INDEX "MarketInstrument_symbol_exchange_quoteCurrency_provider_key" ON "MarketInstrument"("symbol", "exchange", "quoteCurrency", "provider");
CREATE UNIQUE INDEX "MarketInstrument_provider_providerInstrumentId_key" ON "MarketInstrument"("provider", "providerInstrumentId");
CREATE INDEX "MarketInstrument_symbol_idx" ON "MarketInstrument"("symbol");
CREATE INDEX "MarketInstrument_exchange_idx" ON "MarketInstrument"("exchange");
CREATE INDEX "MarketInstrument_quoteCurrency_idx" ON "MarketInstrument"("quoteCurrency");
CREATE INDEX "MarketInstrument_freshnessStatus_idx" ON "MarketInstrument"("freshnessStatus");

CREATE INDEX "Asset_marketInstrumentId_idx" ON "Asset"("marketInstrumentId");
CREATE INDEX "HoldingLot_marketInstrumentId_idx" ON "HoldingLot"("marketInstrumentId");

CREATE UNIQUE INDEX "PriceSnapshot_holdingLotId_pricedAt_currency_source_key" ON "PriceSnapshot"("holdingLotId", "pricedAt", "currency", "source");
CREATE UNIQUE INDEX "PriceSnapshot_marketInstrumentId_pricedAt_currency_provider_key" ON "PriceSnapshot"("marketInstrumentId", "pricedAt", "currency", "provider");
CREATE INDEX "PriceSnapshot_pricedAt_idx" ON "PriceSnapshot"("pricedAt");
CREATE INDEX "PriceSnapshot_currency_idx" ON "PriceSnapshot"("currency");
CREATE INDEX "PriceSnapshot_provider_idx" ON "PriceSnapshot"("provider");
CREATE INDEX "PriceSnapshot_freshnessStatus_idx" ON "PriceSnapshot"("freshnessStatus");
CREATE INDEX "PriceSnapshot_marketInstrumentId_idx" ON "PriceSnapshot"("marketInstrumentId");
