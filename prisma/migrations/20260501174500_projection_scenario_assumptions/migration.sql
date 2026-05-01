-- Epic 5 / #62: configurable projection scenario assumptions.
-- Adds neutral, user-editable assumptions to projection scenarios so future
-- projection engines can reference scenario data instead of hardcoded values.

ALTER TABLE "ProjectionScenario" ADD COLUMN "monthlySurplus" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProjectionScenario" ADD COLUMN "annualGrowthRate" REAL;
ALTER TABLE "ProjectionScenario" ADD COLUMN "annualInflationRate" REAL;
ALTER TABLE "ProjectionScenario" ADD COLUMN "horizonMonths" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "ProjectionScenario" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CAD';
ALTER TABLE "ProjectionScenario" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProjectionScenario" ADD COLUMN "notes" TEXT;

CREATE INDEX "ProjectionScenario_currency_idx" ON "ProjectionScenario"("currency");
CREATE INDEX "ProjectionScenario_isActive_idx" ON "ProjectionScenario"("isActive");
CREATE INDEX "ProjectionScenario_horizonMonths_idx" ON "ProjectionScenario"("horizonMonths");
