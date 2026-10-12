CREATE TABLE "DecisionEdit" ("id" TEXT NOT NULL PRIMARY KEY,"decisionId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"version" INTEGER NOT NULL,"beforeJson" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "DecisionEdit_decisionId_version_key" ON "DecisionEdit"("decisionId","version");
