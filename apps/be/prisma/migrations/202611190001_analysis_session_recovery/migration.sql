CREATE TABLE "AnalysisSessionRecovery" (
    "requestId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'scheduled',
    "nextAttemptAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "purgedAt" DATETIME,
    "owner" TEXT,
    "leaseUntil" DATETIME,
    PRIMARY KEY ("requestId", "sessionId")
);

CREATE INDEX "AnalysisSessionRecovery_state_nextAttemptAt_idx"
ON "AnalysisSessionRecovery"("state", "nextAttemptAt");
