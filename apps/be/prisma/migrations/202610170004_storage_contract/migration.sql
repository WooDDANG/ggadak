PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE _StorageGuard(valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO _StorageGuard SELECT CASE WHEN EXISTS(SELECT 1 FROM Decision WHERE domainJson IS NULL OR storageVersion<>1) THEN 0 ELSE 1 END;
CREATE TABLE new_Decision (
 id TEXT NOT NULL PRIMARY KEY, domainJson TEXT NOT NULL, storageVersion INTEGER NOT NULL DEFAULT 1,
 lifecycle TEXT NOT NULL DEFAULT 'IN_REVIEW', category TEXT NOT NULL DEFAULT '기타', topic TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, guildId TEXT NOT NULL, channelId TEXT NOT NULL, title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Draft', supersedesId TEXT, supersededById TEXT, evidenceHash TEXT NOT NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmedAt DATETIME, updatedAt DATETIME NOT NULL
);
INSERT INTO new_Decision SELECT id,domainJson,storageVersion,lifecycle,category,topic,version,guildId,channelId,title,status,supersedesId,supersededById,evidenceHash,createdAt,confirmedAt,updatedAt FROM Decision;
DROP TABLE Decision;
ALTER TABLE new_Decision RENAME TO Decision;
CREATE INDEX Decision_guildId_channelId_idx ON Decision(guildId,channelId);
CREATE INDEX Decision_status_idx ON Decision(status);
CREATE INDEX Decision_guildId_lifecycle_category_createdAt_idx ON Decision(guildId,lifecycle,category,createdAt);
CREATE INDEX Decision_guildId_lifecycle_confirmedAt_idx ON Decision(guildId,lifecycle,confirmedAt);
CREATE INDEX Decision_supersedesId_idx ON Decision(supersedesId);
CREATE INDEX Decision_guildId_channelId_evidenceHash_idx ON Decision(guildId,channelId,evidenceHash);
CREATE TABLE new_ExternalFeedback (
 id TEXT NOT NULL PRIMARY KEY, channelId TEXT NOT NULL, source TEXT NOT NULL, content TEXT NOT NULL, detail TEXT,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO new_ExternalFeedback SELECT id,
 COALESCE(json_extract(domainJson,'$.channelId'),channelId,decisionId),
 COALESCE(json_extract(domainJson,'$.source'),source),
 COALESCE(json_extract(domainJson,'$.content'),content),
 COALESCE(json_extract(domainJson,'$.detail'),externalUrl),createdAt FROM ExternalFeedback;
DROP TABLE ExternalFeedback;
ALTER TABLE new_ExternalFeedback RENAME TO ExternalFeedback;
CREATE INDEX ExternalFeedback_channelId_createdAt_idx ON ExternalFeedback(channelId,createdAt);
ALTER TABLE RejectedEvidenceHash DROP COLUMN reason;
ALTER TABLE AnalysisRequest DROP COLUMN configJson;
CREATE TABLE new_CandidateIdentity (
 key TEXT NOT NULL PRIMARY KEY, decisionId TEXT NOT NULL, guildId TEXT NOT NULL, channelId TEXT NOT NULL,
 evidenceJson TEXT NOT NULL, normalizedContent TEXT NOT NULL,
 FOREIGN KEY(decisionId) REFERENCES Decision(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO new_CandidateIdentity SELECT * FROM CandidateIdentity;
DROP TABLE CandidateIdentity;
ALTER TABLE new_CandidateIdentity RENAME TO CandidateIdentity;
CREATE INDEX CandidateIdentity_decisionId_idx ON CandidateIdentity(decisionId);
CREATE INDEX CandidateIdentity_guildId_channelId_idx ON CandidateIdentity(guildId,channelId);
CREATE TABLE CandidateRelation (
 requestId TEXT NOT NULL, decisionId TEXT NOT NULL, relatedDecisionId TEXT NOT NULL,
 PRIMARY KEY(requestId,decisionId,relatedDecisionId),
 FOREIGN KEY(requestId,decisionId) REFERENCES CandidateAnalysis(requestId,decisionId) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY(relatedDecisionId) REFERENCES Decision(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT OR IGNORE INTO CandidateRelation SELECT requestId,decisionId,j.value FROM CandidateAnalysis,json_each(relatedJson) j;
CREATE INDEX CandidateRelation_relatedDecisionId_idx ON CandidateRelation(relatedDecisionId);
CREATE TABLE new_CandidateAnalysis (
 requestId TEXT NOT NULL, decisionId TEXT NOT NULL, previousRequestsJson TEXT NOT NULL,
 PRIMARY KEY(requestId,decisionId),
 FOREIGN KEY(requestId) REFERENCES AnalysisRequest(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY(decisionId) REFERENCES Decision(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO new_CandidateAnalysis SELECT requestId,decisionId,previousRequestsJson FROM CandidateAnalysis;
DROP TABLE CandidateAnalysis;
ALTER TABLE new_CandidateAnalysis RENAME TO CandidateAnalysis;
CREATE INDEX CandidateAnalysis_decisionId_idx ON CandidateAnalysis(decisionId);
CREATE TABLE new_DecisionEdit (
 id TEXT NOT NULL PRIMARY KEY, decisionId TEXT NOT NULL, actorId TEXT NOT NULL, version INTEGER NOT NULL,
 beforeJson TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(decisionId) REFERENCES Decision(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO new_DecisionEdit SELECT * FROM DecisionEdit;
DROP TABLE DecisionEdit;
ALTER TABLE new_DecisionEdit RENAME TO DecisionEdit;
CREATE UNIQUE INDEX DecisionEdit_decisionId_version_key ON DecisionEdit(decisionId,version);
INSERT INTO _StorageGuard SELECT CASE WHEN EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 0 ELSE 1 END;
DROP TABLE _StorageGuard;
COMMIT;
PRAGMA foreign_keys=ON;
