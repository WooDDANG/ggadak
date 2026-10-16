ALTER TABLE "AuthSession" ADD COLUMN "browserTokenHash" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "refreshOwner" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "refreshLeaseUntil" DATETIME;
ALTER TABLE "AuthSession" ADD COLUMN "refreshVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "AuthSession_browserTokenHash_key" ON "AuthSession"("browserTokenHash");
