CREATE TABLE "AnalysisReceipt" (
 "id" TEXT NOT NULL PRIMARY KEY, "fingerprint" TEXT NOT NULL, "guildId" TEXT NOT NULL,
 "channelId" TEXT NOT NULL, "scanId" TEXT, "rangeIndex" INTEGER, "rangeJson" TEXT,
 "inputJson" TEXT, "inputBytes" INTEGER NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending',
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "owner" TEXT, "leaseUntil" DATETIME, "errorCategory" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" DATETIME, "completedAt" DATETIME, "acknowledgedAt" DATETIME
);
CREATE UNIQUE INDEX "AnalysisReceipt_scanId_rangeIndex_key" ON "AnalysisReceipt"("scanId","rangeIndex");
CREATE INDEX "AnalysisReceipt_state_nextAttemptAt_idx" ON "AnalysisReceipt"("state","nextAttemptAt");
CREATE INDEX "AnalysisReceipt_guildId_createdAt_idx" ON "AnalysisReceipt"("guildId","createdAt");
CREATE TABLE "AnalysisScan" (
 "id" TEXT NOT NULL PRIMARY KEY, "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL,
 "upperMessageId" TEXT NOT NULL, "afterMessageId" TEXT NOT NULL, "expectedRanges" INTEGER,
 "state" TEXT NOT NULL DEFAULT 'receiving', "jobId" TEXT, "jobOwner" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AnalysisScan_jobId_idx" ON "AnalysisScan"("jobId");
CREATE TABLE "AnalysisQueueControl" (
 "id" TEXT NOT NULL PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 0,
 "foregroundCount" INTEGER NOT NULL DEFAULT 0, "pauseUntil" DATETIME
);
CREATE TABLE "AnalysisExecution" (
 "id" TEXT NOT NULL PRIMARY KEY, "owner" TEXT, "requestId" TEXT, "channelId" TEXT, "leaseUntil" DATETIME
);
