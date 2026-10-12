CREATE TABLE "SyncJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "forceFullSync" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "channelIdsJson" TEXT NOT NULL,
  "totalChannels" INTEGER NOT NULL DEFAULT 0,
  "completedChannels" INTEGER NOT NULL DEFAULT 0,
  "failedChannels" INTEGER NOT NULL DEFAULT 0,
  "decisionsFound" INTEGER NOT NULL DEFAULT 0,
  "messagesScanned" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "leaseUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME
);
CREATE INDEX "SyncJob_guildId_createdAt_idx" ON "SyncJob"("guildId", "createdAt");
CREATE INDEX "SyncJob_status_leaseUntil_idx" ON "SyncJob"("status", "leaseUntil");
CREATE TABLE "SyncJobLock" ("guildId" TEXT NOT NULL PRIMARY KEY, "jobId" TEXT NOT NULL UNIQUE);
