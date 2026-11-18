CREATE TABLE "NvidiaAccountBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nextRequestAt" REAL NOT NULL DEFAULT 0,
    "cooldownUntil" REAL NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSelectedAt" REAL NOT NULL DEFAULT 0
);
