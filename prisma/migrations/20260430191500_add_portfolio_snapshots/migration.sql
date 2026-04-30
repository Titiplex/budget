-- Local portfolio history snapshots for Epic 4.
-- This table stores dashboard-ready aggregates so history can be read offline
-- without rebuilding valuations or calling market-data providers.

CREATE TABLE "PortfolioSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotKey" TEXT NOT NULL,
    "portfolioId" INTEGER,
    "snapshotDate" DATETIME NOT NULL,
    "periodKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "totalMarketValue" REAL NOT NULL DEFAULT 0,
    "totalInvestedCost" REAL NOT NULL DEFAULT 0,
    "totalUnrealizedGain" REAL NOT NULL DEFAULT 0,
    "cumulativeIncome" REAL,
    "cumulativeFees" REAL,
    "completenessStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "positionsCount" INTEGER NOT NULL DEFAULT 0,
    "valuedPositionsCount" INTEGER NOT NULL DEFAULT 0,
    "missingValuePositionsCount" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PortfolioSnapshot_snapshotKey_key" ON "PortfolioSnapshot"("snapshotKey");
CREATE INDEX "PortfolioSnapshot_portfolioId_idx" ON "PortfolioSnapshot"("portfolioId");
CREATE INDEX "PortfolioSnapshot_snapshotDate_idx" ON "PortfolioSnapshot"("snapshotDate");
CREATE INDEX "PortfolioSnapshot_currency_idx" ON "PortfolioSnapshot"("currency");
CREATE INDEX "PortfolioSnapshot_source_idx" ON "PortfolioSnapshot"("source");
CREATE INDEX "PortfolioSnapshot_completenessStatus_idx" ON "PortfolioSnapshot"("completenessStatus");
