CREATE TABLE "DecisionEmbedding" (
  "decisionId" TEXT NOT NULL PRIMARY KEY,
  "model" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "vectorJson" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DecisionEmbedding_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- All writers (review, edit, extraction, legacy) durably invalidate affected documents.
CREATE TRIGGER "invalidate_decision_embedding" AFTER UPDATE ON "Decision"
BEGIN
  DELETE FROM "DecisionEmbedding" WHERE "decisionId" = NEW."id";
END;
