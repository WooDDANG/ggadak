ALTER TABLE "Decision" ADD COLUMN "domainJson" TEXT;
ALTER TABLE "Decision" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ExternalFeedback" ADD COLUMN "domainJson" TEXT;
ALTER TABLE "ExternalFeedback" ADD COLUMN "channelId" TEXT;
