ALTER TABLE "NvidiaAccountBudget" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "NvidiaAccountBudget" ADD COLUMN "leaseUntil" REAL NOT NULL DEFAULT 0;
UPDATE "NvidiaAccountBudget"
SET "cooldownUntil" = MAX("cooldownUntil", CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 60000)
WHERE "nextRequestAt" > CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 60000;
CREATE TABLE "NvidiaAccountRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "startedAt" REAL NOT NULL
);
CREATE INDEX "NvidiaAccountRequest_accountId_startedAt_idx" ON "NvidiaAccountRequest"("accountId", "startedAt");
