CREATE TABLE "AnalysisRequest" (
  "id" TEXT NOT NULL PRIMARY KEY, "fingerprint" TEXT NOT NULL,
  "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "manual" BOOLEAN NOT NULL,
  "state" TEXT NOT NULL, "owner" TEXT, "leaseUntil" DATETIME, "resultJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME
);
CREATE TABLE "CandidateIdentity" (
  "key" TEXT NOT NULL PRIMARY KEY, "decisionId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL,
  "evidenceJson" TEXT NOT NULL, "normalizedContent" TEXT NOT NULL
);
CREATE INDEX "CandidateIdentity_decisionId_idx" ON "CandidateIdentity"("decisionId");
CREATE INDEX "CandidateIdentity_guildId_channelId_idx" ON "CandidateIdentity"("guildId", "channelId");
CREATE TABLE "CandidateAnalysis" (
  "requestId" TEXT NOT NULL, "decisionId" TEXT NOT NULL,
  "relatedJson" TEXT NOT NULL, "previousRequestsJson" TEXT NOT NULL,
  PRIMARY KEY ("requestId", "decisionId")
);
CREATE INDEX "CandidateAnalysis_decisionId_idx" ON "CandidateAnalysis"("decisionId");
