-- CreateTable
CREATE TABLE "ImportSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL_FILE',
    "importType" TEXT NOT NULL DEFAULT 'TRANSACTIONS',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "externalSourceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultAccountId" INTEGER,
    CONSTRAINT "ImportSource_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "importType" TEXT NOT NULL DEFAULT 'TRANSACTIONS',
    "provider" TEXT,
    "fileName" TEXT,
    "fileHash" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "parserVersion" TEXT,
    "sourceMetadataJson" TEXT,
    "retentionPolicyJson" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" DATETIME,
    "previewedAt" DATETIME,
    "appliedAt" DATETIME,
    "cancelledAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceId" INTEGER,
    CONSTRAINT "ImportBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRawRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rowNumber" INTEGER NOT NULL,
    "rawText" TEXT,
    "rawJson" TEXT NOT NULL,
    "rawHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RAW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batchId" INTEGER NOT NULL,
    CONSTRAINT "ImportRawRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportNormalizedRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NORMALIZED',
    "targetKind" TEXT NOT NULL DEFAULT 'TRANSACTION',
    "normalizedJson" TEXT NOT NULL,
    "transactionDate" DATETIME,
    "label" TEXT,
    "amount" REAL,
    "currency" TEXT,
    "accountName" TEXT,
    "externalRef" TEXT,
    "duplicateKey" TEXT,
    "duplicateConfidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batchId" INTEGER NOT NULL,
    "rawRowId" INTEGER,
    CONSTRAINT "ImportNormalizedRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportNormalizedRow_rawRowId_fkey" FOREIGN KEY ("rawRowId") REFERENCES "ImportRawRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stage" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "field" TEXT,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" INTEGER NOT NULL,
    "rawRowId" INTEGER,
    "normalizedRowId" INTEGER,
    CONSTRAINT "ImportError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportError_rawRowId_fkey" FOREIGN KEY ("rawRowId") REFERENCES "ImportRawRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportError_normalizedRowId_fkey" FOREIGN KEY ("normalizedRowId") REFERENCES "ImportNormalizedRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportReconciliationDecision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "confidence" REAL,
    "reason" TEXT,
    "decisionJson" TEXT,
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batchId" INTEGER NOT NULL,
    "normalizedRowId" INTEGER NOT NULL,
    "candidateTransactionId" INTEGER,
    "candidateAssetId" INTEGER,
    CONSTRAINT "ImportReconciliationDecision_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportReconciliationDecision_normalizedRowId_fkey" FOREIGN KEY ("normalizedRowId") REFERENCES "ImportNormalizedRow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportReconciliationDecision_candidateTransactionId_fkey" FOREIGN KEY ("candidateTransactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportReconciliationDecision_candidateAssetId_fkey" FOREIGN KEY ("candidateAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportAppliedLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entitySnapshotJson" TEXT,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batchId" INTEGER NOT NULL,
    "normalizedRowId" INTEGER,
    "decisionId" INTEGER,
    "transactionId" INTEGER,
    "assetId" INTEGER,
    CONSTRAINT "ImportAppliedLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportAppliedLink_normalizedRowId_fkey" FOREIGN KEY ("normalizedRowId") REFERENCES "ImportNormalizedRow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportAppliedLink_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ImportReconciliationDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportAppliedLink_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportAppliedLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportSource_sourceKey_key" ON "ImportSource"("sourceKey");
CREATE INDEX "ImportSource_provider_idx" ON "ImportSource"("provider");
CREATE INDEX "ImportSource_sourceType_idx" ON "ImportSource"("sourceType");
CREATE INDEX "ImportSource_importType_idx" ON "ImportSource"("importType");
CREATE INDEX "ImportSource_defaultAccountId_idx" ON "ImportSource"("defaultAccountId");
CREATE INDEX "ImportSource_isActive_idx" ON "ImportSource"("isActive");

-- CreateIndex
CREATE INDEX "ImportBatch_sourceId_idx" ON "ImportBatch"("sourceId");
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");
CREATE INDEX "ImportBatch_importType_idx" ON "ImportBatch"("importType");
CREATE INDEX "ImportBatch_provider_idx" ON "ImportBatch"("provider");
CREATE INDEX "ImportBatch_fileHash_idx" ON "ImportBatch"("fileHash");
CREATE INDEX "ImportBatch_importedAt_idx" ON "ImportBatch"("importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRawRow_batchId_rowNumber_key" ON "ImportRawRow"("batchId", "rowNumber");
CREATE INDEX "ImportRawRow_batchId_idx" ON "ImportRawRow"("batchId");
CREATE INDEX "ImportRawRow_status_idx" ON "ImportRawRow"("status");
CREATE INDEX "ImportRawRow_rawHash_idx" ON "ImportRawRow"("rawHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportNormalizedRow_batchId_rowNumber_key" ON "ImportNormalizedRow"("batchId", "rowNumber");
CREATE INDEX "ImportNormalizedRow_batchId_idx" ON "ImportNormalizedRow"("batchId");
CREATE INDEX "ImportNormalizedRow_rawRowId_idx" ON "ImportNormalizedRow"("rawRowId");
CREATE INDEX "ImportNormalizedRow_status_idx" ON "ImportNormalizedRow"("status");
CREATE INDEX "ImportNormalizedRow_targetKind_idx" ON "ImportNormalizedRow"("targetKind");
CREATE INDEX "ImportNormalizedRow_transactionDate_idx" ON "ImportNormalizedRow"("transactionDate");
CREATE INDEX "ImportNormalizedRow_duplicateKey_idx" ON "ImportNormalizedRow"("duplicateKey");

-- CreateIndex
CREATE INDEX "ImportError_batchId_idx" ON "ImportError"("batchId");
CREATE INDEX "ImportError_rawRowId_idx" ON "ImportError"("rawRowId");
CREATE INDEX "ImportError_normalizedRowId_idx" ON "ImportError"("normalizedRowId");
CREATE INDEX "ImportError_stage_idx" ON "ImportError"("stage");
CREATE INDEX "ImportError_severity_idx" ON "ImportError"("severity");
CREATE INDEX "ImportError_code_idx" ON "ImportError"("code");

-- CreateIndex
CREATE INDEX "ImportReconciliationDecision_batchId_idx" ON "ImportReconciliationDecision"("batchId");
CREATE INDEX "ImportReconciliationDecision_normalizedRowId_idx" ON "ImportReconciliationDecision"("normalizedRowId");
CREATE INDEX "ImportReconciliationDecision_candidateTransactionId_idx" ON "ImportReconciliationDecision"("candidateTransactionId");
CREATE INDEX "ImportReconciliationDecision_candidateAssetId_idx" ON "ImportReconciliationDecision"("candidateAssetId");
CREATE INDEX "ImportReconciliationDecision_action_idx" ON "ImportReconciliationDecision"("action");
CREATE INDEX "ImportReconciliationDecision_status_idx" ON "ImportReconciliationDecision"("status");
CREATE INDEX "ImportReconciliationDecision_decidedAt_idx" ON "ImportReconciliationDecision"("decidedAt");

-- CreateIndex
CREATE INDEX "ImportAppliedLink_batchId_idx" ON "ImportAppliedLink"("batchId");
CREATE INDEX "ImportAppliedLink_normalizedRowId_idx" ON "ImportAppliedLink"("normalizedRowId");
CREATE INDEX "ImportAppliedLink_decisionId_idx" ON "ImportAppliedLink"("decisionId");
CREATE INDEX "ImportAppliedLink_transactionId_idx" ON "ImportAppliedLink"("transactionId");
CREATE INDEX "ImportAppliedLink_assetId_idx" ON "ImportAppliedLink"("assetId");
CREATE INDEX "ImportAppliedLink_entityType_idx" ON "ImportAppliedLink"("entityType");
CREATE INDEX "ImportAppliedLink_operation_idx" ON "ImportAppliedLink"("operation");
CREATE INDEX "ImportAppliedLink_appliedAt_idx" ON "ImportAppliedLink"("appliedAt");
