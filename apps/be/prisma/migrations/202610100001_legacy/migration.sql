-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "decisionSummary" TEXT NOT NULL,
    "keyReason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "decisionMaker" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "alternatives" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "supersedesId" TEXT,
    "supersededById" TEXT,
    "sourceJumpUrl" TEXT NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "governanceScore" REAL NOT NULL,
    "governanceReason" TEXT NOT NULL,
    "governancePassed" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ExternalFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "decisionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "externalUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChannelCheckpoint" (
    "channelId" TEXT NOT NULL PRIMARY KEY,
    "lastMessageId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RejectedEvidenceHash" (
    "evidenceHash" TEXT NOT NULL PRIMARY KEY,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Decision_guildId_channelId_idx" ON "Decision"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "Decision_status_idx" ON "Decision"("status");

-- CreateIndex
CREATE INDEX "Decision_supersedesId_idx" ON "Decision"("supersedesId");

-- CreateIndex
CREATE INDEX "ExternalFeedback_decisionId_idx" ON "ExternalFeedback"("decisionId");

