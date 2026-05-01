-- Epic 5 / #59: goals and projection data model.
-- Local-first schema for financial goals, projection scenarios/settings and calculated monthly results.
-- Stores neutral projection state only; no buy/sell recommendation or advisory output is persisted.

CREATE TABLE "FinancialGoal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "targetDate" DATETIME,
    "startingAmount" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "trackedAssetId" INTEGER,
    "trackedPortfolioId" INTEGER,
    "trackedLiabilityId" INTEGER,
    "baselineNetWorthSnapshotId" INTEGER,
    CONSTRAINT "FinancialGoal_trackedAssetId_fkey" FOREIGN KEY ("trackedAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialGoal_trackedPortfolioId_fkey" FOREIGN KEY ("trackedPortfolioId") REFERENCES "Portfolio" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialGoal_trackedLiabilityId_fkey" FOREIGN KEY ("trackedLiabilityId") REFERENCES "Liability" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialGoal_baselineNetWorthSnapshotId_fkey" FOREIGN KEY ("baselineNetWorthSnapshotId") REFERENCES "NetWorthSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProjectionScenario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProjectionSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectionHorizonMonths" INTEGER NOT NULL,
    "displayCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "estimatedMonthlySurplus" REAL NOT NULL DEFAULT 0,
    "manualMonthlyContribution" REAL,
    "annualGrowthRate" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "goalId" INTEGER NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    CONSTRAINT "ProjectionSetting_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectionSetting_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ProjectionScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectionResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectionMonth" DATETIME NOT NULL,
    "projectedValue" REAL NOT NULL,
    "remainingAmount" REAL NOT NULL,
    "progressPercent" REAL NOT NULL,
    "estimatedReachDate" DATETIME,
    "reachStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "goalId" INTEGER NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "settingId" INTEGER,
    CONSTRAINT "ProjectionResult_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectionResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ProjectionScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectionResult_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "ProjectionSetting" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FinancialGoal_type_idx" ON "FinancialGoal"("type");
CREATE INDEX "FinancialGoal_status_idx" ON "FinancialGoal"("status");
CREATE INDEX "FinancialGoal_currency_idx" ON "FinancialGoal"("currency");
CREATE INDEX "FinancialGoal_priority_idx" ON "FinancialGoal"("priority");
CREATE INDEX "FinancialGoal_targetDate_idx" ON "FinancialGoal"("targetDate");
CREATE INDEX "FinancialGoal_trackedAssetId_idx" ON "FinancialGoal"("trackedAssetId");
CREATE INDEX "FinancialGoal_trackedPortfolioId_idx" ON "FinancialGoal"("trackedPortfolioId");
CREATE INDEX "FinancialGoal_trackedLiabilityId_idx" ON "FinancialGoal"("trackedLiabilityId");
CREATE INDEX "FinancialGoal_baselineNetWorthSnapshotId_idx" ON "FinancialGoal"("baselineNetWorthSnapshotId");

CREATE UNIQUE INDEX "ProjectionScenario_name_key" ON "ProjectionScenario"("name");
CREATE INDEX "ProjectionScenario_kind_idx" ON "ProjectionScenario"("kind");
CREATE INDEX "ProjectionScenario_isDefault_idx" ON "ProjectionScenario"("isDefault");

CREATE UNIQUE INDEX "ProjectionSetting_goalId_scenarioId_key" ON "ProjectionSetting"("goalId", "scenarioId");
CREATE INDEX "ProjectionSetting_goalId_idx" ON "ProjectionSetting"("goalId");
CREATE INDEX "ProjectionSetting_scenarioId_idx" ON "ProjectionSetting"("scenarioId");
CREATE INDEX "ProjectionSetting_displayCurrency_idx" ON "ProjectionSetting"("displayCurrency");

CREATE UNIQUE INDEX "ProjectionResult_goalId_scenarioId_projectionMonth_key" ON "ProjectionResult"("goalId", "scenarioId", "projectionMonth");
CREATE INDEX "ProjectionResult_goalId_idx" ON "ProjectionResult"("goalId");
CREATE INDEX "ProjectionResult_scenarioId_idx" ON "ProjectionResult"("scenarioId");
CREATE INDEX "ProjectionResult_settingId_idx" ON "ProjectionResult"("settingId");
CREATE INDEX "ProjectionResult_projectionMonth_idx" ON "ProjectionResult"("projectionMonth");
CREATE INDEX "ProjectionResult_reachStatus_idx" ON "ProjectionResult"("reachStatus");
