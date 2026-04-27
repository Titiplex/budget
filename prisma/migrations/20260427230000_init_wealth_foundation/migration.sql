-- Initial Prisma migration including the existing budget schema plus the Epic 2 wealth foundation.
-- The wealth tables model point-in-time patrimony valuation and do not replace budget cash-flow tables.

CREATE TABLE "Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "description" TEXT,
    "institutionCountry" TEXT,
    "institutionRegion" TEXT,
    "taxReportingType" TEXT NOT NULL DEFAULT 'STANDARD',
    "openedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "TaxProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "residenceCountry" TEXT NOT NULL,
    "residenceRegion" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "BudgetTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "period" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "categoryId" INTEGER NOT NULL,
    CONSTRAINT "BudgetTarget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RecurringTransactionTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "sourceAmount" REAL NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "accountAmount" REAL,
    "conversionMode" TEXT NOT NULL DEFAULT 'NONE',
    "exchangeRate" REAL,
    "exchangeProvider" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "frequency" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATETIME NOT NULL,
    "nextOccurrenceDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    CONSTRAINT "RecurringTransactionTemplate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringTransactionTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "sourceAmount" REAL,
    "sourceCurrency" TEXT,
    "conversionMode" TEXT NOT NULL DEFAULT 'NONE',
    "exchangeRate" REAL,
    "exchangeProvider" TEXT,
    "exchangeDate" DATETIME,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "note" TEXT,
    "taxCategory" TEXT,
    "taxSourceCountry" TEXT,
    "taxSourceRegion" TEXT,
    "taxTreatment" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "taxWithheldAmount" REAL,
    "taxWithheldCurrency" TEXT,
    "taxWithheldCountry" TEXT,
    "taxDocumentRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "transferGroup" TEXT,
    "transferDirection" TEXT,
    "transferPeerAccountId" INTEGER,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_transferPeerAccountId_fkey" FOREIGN KEY ("transferPeerAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "valuationMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "currentValue" REAL NOT NULL DEFAULT 0,
    "acquisitionValue" REAL,
    "acquiredAt" DATETIME,
    "valueAsOf" DATETIME,
    "institutionName" TEXT,
    "institutionCountry" TEXT,
    "institutionRegion" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Portfolio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "institutionName" TEXT,
    "institutionCountry" TEXT,
    "institutionRegion" TEXT,
    "taxWrapper" TEXT NOT NULL DEFAULT 'NONE',
    "valuationMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "currentValue" REAL NOT NULL DEFAULT 0,
    "cashBalance" REAL NOT NULL DEFAULT 0,
    "valueAsOf" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountId" INTEGER,
    CONSTRAINT "Portfolio_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "HoldingLot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "assetClass" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "unitCost" REAL,
    "costBasis" REAL,
    "unitPrice" REAL,
    "marketValue" REAL,
    "openedAt" DATETIME,
    "valueAsOf" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "portfolioId" INTEGER NOT NULL,
    CONSTRAINT "HoldingLot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PriceSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "unitPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "pricedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "holdingLotId" INTEGER NOT NULL,
    CONSTRAINT "PriceSnapshot_holdingLotId_fkey" FOREIGN KEY ("holdingLotId") REFERENCES "HoldingLot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Liability" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "currentBalance" REAL NOT NULL DEFAULT 0,
    "initialAmount" REAL,
    "interestRate" REAL,
    "lenderName" TEXT,
    "institutionCountry" TEXT,
    "institutionRegion" TEXT,
    "openedAt" DATETIME,
    "dueAt" DATETIME,
    "balanceAsOf" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "securedAssetId" INTEGER,
    "accountId" INTEGER,
    CONSTRAINT "Liability_securedAssetId_fkey" FOREIGN KEY ("securedAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "NetWorthSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotDate" DATETIME NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "totalStandaloneAssets" REAL NOT NULL DEFAULT 0,
    "totalPortfolios" REAL NOT NULL DEFAULT 0,
    "totalAssets" REAL NOT NULL DEFAULT 0,
    "totalLiabilities" REAL NOT NULL DEFAULT 0,
    "netWorth" REAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "assetBreakdownJson" TEXT,
    "portfolioBreakdownJson" TEXT,
    "liabilityBreakdownJson" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "TaxProfile_year_residenceCountry_residenceRegion_key" ON "TaxProfile"("year", "residenceCountry", "residenceRegion");

CREATE INDEX "Asset_type_idx" ON "Asset"("type");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Asset_currency_idx" ON "Asset"("currency");

CREATE UNIQUE INDEX "Portfolio_accountId_key" ON "Portfolio"("accountId");
CREATE INDEX "Portfolio_type_idx" ON "Portfolio"("type");
CREATE INDEX "Portfolio_status_idx" ON "Portfolio"("status");
CREATE INDEX "Portfolio_currency_idx" ON "Portfolio"("currency");
CREATE INDEX "Portfolio_institutionCountry_institutionRegion_idx" ON "Portfolio"("institutionCountry", "institutionRegion");

CREATE INDEX "HoldingLot_portfolioId_idx" ON "HoldingLot"("portfolioId");
CREATE INDEX "HoldingLot_assetClass_idx" ON "HoldingLot"("assetClass");
CREATE INDEX "HoldingLot_symbol_idx" ON "HoldingLot"("symbol");
CREATE INDEX "HoldingLot_currency_idx" ON "HoldingLot"("currency");

CREATE UNIQUE INDEX "PriceSnapshot_holdingLotId_pricedAt_currency_source_key" ON "PriceSnapshot"("holdingLotId", "pricedAt", "currency", "source");
CREATE INDEX "PriceSnapshot_pricedAt_idx" ON "PriceSnapshot"("pricedAt");
CREATE INDEX "PriceSnapshot_currency_idx" ON "PriceSnapshot"("currency");

CREATE INDEX "Liability_type_idx" ON "Liability"("type");
CREATE INDEX "Liability_status_idx" ON "Liability"("status");
CREATE INDEX "Liability_currency_idx" ON "Liability"("currency");
CREATE INDEX "Liability_securedAssetId_idx" ON "Liability"("securedAssetId");
CREATE INDEX "Liability_accountId_idx" ON "Liability"("accountId");

CREATE UNIQUE INDEX "NetWorthSnapshot_snapshotDate_currency_source_key" ON "NetWorthSnapshot"("snapshotDate", "currency", "source");
CREATE INDEX "NetWorthSnapshot_snapshotDate_idx" ON "NetWorthSnapshot"("snapshotDate");
CREATE INDEX "NetWorthSnapshot_currency_idx" ON "NetWorthSnapshot"("currency");
