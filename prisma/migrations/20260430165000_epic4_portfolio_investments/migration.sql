-- Epic 4 / #41: portfolio instruments, investment positions and movements.
-- The model is local-first and keeps market-data links optional.

CREATE TABLE "InvestmentInstrument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instrumentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "assetClass" TEXT NOT NULL,
    "geographicRegion" TEXT NOT NULL DEFAULT 'GLOBAL',
    "sector" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "exchange" TEXT,
    "isin" TEXT,
    "cusip" TEXT,
    "issuer" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "marketInstrumentId" INTEGER,
    CONSTRAINT "InvestmentInstrument_marketInstrumentId_fkey" FOREIGN KEY ("marketInstrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InvestmentPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "quantity" REAL NOT NULL DEFAULT 0,
    "averageUnitCost" REAL,
    "costBasis" REAL,
    "costCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "openedAt" DATETIME,
    "closedAt" DATETIME,
    "valueAsOf" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "portfolioId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "instrumentId" INTEGER NOT NULL,
    CONSTRAINT "InvestmentPosition_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestmentPosition_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "InvestmentInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InvestmentMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "quantity" REAL,
    "unitPrice" REAL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "cashAmount" REAL,
    "cashCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "feeCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "operationDate" DATETIME NOT NULL,
    "settlementDate" DATETIME,
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "portfolioId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "instrumentId" INTEGER,
    "positionId" INTEGER,
    CONSTRAINT "InvestmentMovement_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestmentMovement_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "InvestmentInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestmentMovement_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "InvestmentPosition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "PriceSnapshot" ADD COLUMN "investmentPositionId" INTEGER REFERENCES "InvestmentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "InvestmentInstrument_instrumentKey_key" ON "InvestmentInstrument"("instrumentKey");
CREATE INDEX "InvestmentInstrument_assetClass_idx" ON "InvestmentInstrument"("assetClass");
CREATE INDEX "InvestmentInstrument_geographicRegion_idx" ON "InvestmentInstrument"("geographicRegion");
CREATE INDEX "InvestmentInstrument_sector_idx" ON "InvestmentInstrument"("sector");
CREATE INDEX "InvestmentInstrument_symbol_idx" ON "InvestmentInstrument"("symbol");
CREATE INDEX "InvestmentInstrument_currency_idx" ON "InvestmentInstrument"("currency");
CREATE INDEX "InvestmentInstrument_marketInstrumentId_idx" ON "InvestmentInstrument"("marketInstrumentId");

CREATE UNIQUE INDEX "InvestmentPosition_portfolioId_accountId_instrumentId_key" ON "InvestmentPosition"("portfolioId", "accountId", "instrumentId");
CREATE INDEX "InvestmentPosition_portfolioId_idx" ON "InvestmentPosition"("portfolioId");
CREATE INDEX "InvestmentPosition_accountId_idx" ON "InvestmentPosition"("accountId");
CREATE INDEX "InvestmentPosition_instrumentId_idx" ON "InvestmentPosition"("instrumentId");
CREATE INDEX "InvestmentPosition_status_idx" ON "InvestmentPosition"("status");

CREATE INDEX "InvestmentMovement_portfolioId_idx" ON "InvestmentMovement"("portfolioId");
CREATE INDEX "InvestmentMovement_accountId_idx" ON "InvestmentMovement"("accountId");
CREATE INDEX "InvestmentMovement_instrumentId_idx" ON "InvestmentMovement"("instrumentId");
CREATE INDEX "InvestmentMovement_positionId_idx" ON "InvestmentMovement"("positionId");
CREATE INDEX "InvestmentMovement_type_idx" ON "InvestmentMovement"("type");
CREATE INDEX "InvestmentMovement_operationDate_idx" ON "InvestmentMovement"("operationDate");
CREATE UNIQUE INDEX "InvestmentMovement_accountId_externalRef_key" ON "InvestmentMovement"("accountId", "externalRef");

CREATE UNIQUE INDEX "PriceSnapshot_investmentPositionId_pricedAt_currency_provider_key" ON "PriceSnapshot"("investmentPositionId", "pricedAt", "currency", "provider");
CREATE INDEX "PriceSnapshot_investmentPositionId_idx" ON "PriceSnapshot"("investmentPositionId");

CREATE TRIGGER "InvestmentPosition_account_investment_insert"
BEFORE INSERT ON "InvestmentPosition"
FOR EACH ROW
WHEN (SELECT "type" FROM "Account" WHERE "id" = NEW."accountId") <> 'INVESTMENT'
BEGIN
    SELECT RAISE(ABORT, 'InvestmentPosition.accountId must reference an INVESTMENT account');
END;

CREATE TRIGGER "InvestmentPosition_account_investment_update"
BEFORE UPDATE OF "accountId" ON "InvestmentPosition"
FOR EACH ROW
WHEN (SELECT "type" FROM "Account" WHERE "id" = NEW."accountId") <> 'INVESTMENT'
BEGIN
    SELECT RAISE(ABORT, 'InvestmentPosition.accountId must reference an INVESTMENT account');
END;

CREATE TRIGGER "InvestmentMovement_account_investment_insert"
BEFORE INSERT ON "InvestmentMovement"
FOR EACH ROW
WHEN (SELECT "type" FROM "Account" WHERE "id" = NEW."accountId") <> 'INVESTMENT'
BEGIN
    SELECT RAISE(ABORT, 'InvestmentMovement.accountId must reference an INVESTMENT account');
END;

CREATE TRIGGER "InvestmentMovement_account_investment_update"
BEFORE UPDATE OF "accountId" ON "InvestmentMovement"
FOR EACH ROW
WHEN (SELECT "type" FROM "Account" WHERE "id" = NEW."accountId") <> 'INVESTMENT'
BEGIN
    SELECT RAISE(ABORT, 'InvestmentMovement.accountId must reference an INVESTMENT account');
END;

CREATE TRIGGER "Account_investment_links_type_update"
BEFORE UPDATE OF "type" ON "Account"
FOR EACH ROW
WHEN NEW."type" <> 'INVESTMENT'
 AND (
    EXISTS (SELECT 1 FROM "InvestmentPosition" WHERE "accountId" = OLD."id")
    OR EXISTS (SELECT 1 FROM "InvestmentMovement" WHERE "accountId" = OLD."id")
 )
BEGIN
    SELECT RAISE(ABORT, 'Account.type cannot change while investment positions or movements reference it');
END;
