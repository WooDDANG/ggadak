ALTER TABLE "Decision" ADD COLUMN "confirmedAt" DATETIME;

UPDATE "Decision"
SET "confirmedAt" = json_extract("domainJson", '$.decisionConfirmedDate')
WHERE "domainJson" IS NOT NULL
  AND json_type("domainJson", '$.decisionConfirmedDate') = 'text'
  AND json_extract("domainJson", '$.decisionConfirmedDate') GLOB '????-??-??T??:??:??*'
  AND julianday(json_extract("domainJson", '$.decisionConfirmedDate')) IS NOT NULL;

CREATE INDEX "Decision_guildId_lifecycle_confirmedAt_idx"
ON "Decision"("guildId", "lifecycle", "confirmedAt");
