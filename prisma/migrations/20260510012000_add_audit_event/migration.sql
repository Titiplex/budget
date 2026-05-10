-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventType" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "summary" TEXT NOT NULL,
    "entityIdsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT,
    "source" TEXT NOT NULL DEFAULT 'local',
    "status" TEXT NOT NULL DEFAULT 'SUCCESS'
);

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_severity_idx" ON "AuditEvent"("severity");

-- CreateIndex
CREATE INDEX "AuditEvent_domain_idx" ON "AuditEvent"("domain");
