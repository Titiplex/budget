/*
  Warnings:

  - You are about to drop the `PortfolioSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `annualGrowthRate` on the `ProjectionScenario` table. All the data in the column will be lost.
  - You are about to drop the column `annualInflationRate` on the `ProjectionScenario` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `ProjectionScenario` table. All the data in the column will be lost.
  - You are about to drop the column `horizonMonths` on the `ProjectionScenario` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `ProjectionScenario` table. All the data in the column will be lost.
  - You are about to drop the column `monthlySurplus` on the `ProjectionScenario` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `ProjectionScenario` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PortfolioSnapshot_completenessStatus_idx";

-- DropIndex
DROP INDEX "PortfolioSnapshot_source_idx";

-- DropIndex
DROP INDEX "PortfolioSnapshot_currency_idx";

-- DropIndex
DROP INDEX "PortfolioSnapshot_snapshotDate_idx";

-- DropIndex
DROP INDEX "PortfolioSnapshot_portfolioId_idx";

-- DropIndex
DROP INDEX "PortfolioSnapshot_snapshotKey_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PortfolioSnapshot";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectionScenario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProjectionScenario" ("createdAt", "description", "id", "isDefault", "kind", "name", "updatedAt") SELECT "createdAt", "description", "id", "isDefault", "kind", "name", "updatedAt" FROM "ProjectionScenario";
DROP TABLE "ProjectionScenario";
ALTER TABLE "new_ProjectionScenario" RENAME TO "ProjectionScenario";
CREATE UNIQUE INDEX "ProjectionScenario_name_key" ON "ProjectionScenario"("name");
CREATE INDEX "ProjectionScenario_kind_idx" ON "ProjectionScenario"("kind");
CREATE INDEX "ProjectionScenario_isDefault_idx" ON "ProjectionScenario"("isDefault");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
