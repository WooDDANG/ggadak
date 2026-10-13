CREATE TABLE "AnalysisDelivery" (
 "requestId" TEXT NOT NULL PRIMARY KEY, "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL,
 "status" TEXT NOT NULL, "attempts" INTEGER NOT NULL, "nextAttemptAt" REAL NOT NULL,
 "errorCategory" TEXT, "lastError" TEXT, "synchronizedAt" DATETIME NOT NULL
);
CREATE INDEX "AnalysisDelivery_guildId_idx" ON "AnalysisDelivery"("guildId");
CREATE TABLE "AnalysisRetryCommand" (
 "id" TEXT NOT NULL PRIMARY KEY, "requestId" TEXT NOT NULL, "guildId" TEXT NOT NULL,
 "acknowledgedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AnalysisRetryCommand_acknowledgedAt_idx" ON "AnalysisRetryCommand"("acknowledgedAt");

CREATE TABLE "AnalysisDeliveryHeartbeat" ("id" TEXT NOT NULL PRIMARY KEY, "synchronizedAt" DATETIME NOT NULL);
