CREATE TABLE StorageArchive (
 kind TEXT NOT NULL, id TEXT NOT NULL, dataJson TEXT NOT NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(kind,id)
);
ALTER TABLE Decision ADD COLUMN storageVersion INTEGER NOT NULL DEFAULT 0;
CREATE TABLE AnalysisSessionState (
 requestId TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL,
 inputJson TEXT NOT NULL, stateJson TEXT NOT NULL, PRIMARY KEY(requestId,id),
 FOREIGN KEY(requestId) REFERENCES AnalysisRequest(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX AnalysisSessionState_requestId_position_key ON AnalysisSessionState(requestId,position);
CREATE TABLE AiCallLease (
 id TEXT NOT NULL PRIMARY KEY, state TEXT NOT NULL, "limit" INTEGER NOT NULL, leaseUntil DATETIME NOT NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX AiCallLease_state_createdAt_idx ON AiCallLease(state,createdAt);
