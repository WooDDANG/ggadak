-- Preserve historical values before retiring obsolete representations.
INSERT INTO StorageArchive(kind,id,dataJson) SELECT 'Decision',id,json_object('id',id,'domainJson',domainJson,'storageVersion',storageVersion,'lifecycle',lifecycle,'category',category,'topic',topic,'version',version,'guildId',guildId,'channelId',channelId,'messageId',messageId,'title',title,'decisionSummary',decisionSummary,'keyReason',keyReason,'status',status,'decisionMaker',decisionMaker,'participants',participants,'alternatives',alternatives,'tags',tags,'supersedesId',supersedesId,'supersededById',supersededById,'sourceJumpUrl',sourceJumpUrl,'evidenceSummary',evidenceSummary,'evidenceHash',evidenceHash,'governanceScore',governanceScore,'governanceReason',governanceReason,'governancePassed',governancePassed,'createdAt',createdAt,'confirmedAt',confirmedAt,'updatedAt',updatedAt,'archivedAt',archivedAt) FROM Decision;
INSERT INTO StorageArchive(kind,id,dataJson) SELECT 'ExternalFeedback',id,json_object('id',id,'domainJson',domainJson,'channelId',channelId,'decisionId',decisionId,'source',source,'author',author,'content',content,'externalUrl',externalUrl,'createdAt',createdAt) FROM ExternalFeedback;
INSERT INTO StorageArchive(kind,id,dataJson) SELECT 'RejectedEvidenceHash',evidenceHash,json_object('evidenceHash',evidenceHash,'reason',reason,'createdAt',createdAt) FROM RejectedEvidenceHash;
INSERT INTO StorageArchive(kind,id,dataJson) SELECT 'AnalysisRequest',id,json_object('id',id,'configJson',configJson) FROM AnalysisRequest WHERE configJson IS NOT NULL;
INSERT INTO StorageArchive(kind,id,dataJson) SELECT 'CandidateAnalysis',json_array(requestId,decisionId),json_object('requestId',requestId,'decisionId',decisionId,'relatedJson',relatedJson,'previousRequestsJson',previousRequestsJson) FROM CandidateAnalysis;
UPDATE Decision SET domainJson=json_object(
 'id',id,'version',version,'topic',title,'title',title,'decision',decisionSummary,'rationale',keyReason,
 'state',CASE status WHEN 'proposed' THEN 'Proposed' WHEN 'confirmed' THEN 'Decided' WHEN 'rejected' THEN 'Rejected' ELSE status END,
 'supersedesId',supersedesId,'supersededById',supersededById,'rationaleQuotes',json('[]'),
 'alternatives',json(alternatives),'categoryTag',COALESCE(json_extract(tags,'$[0]'),'기타'),
 'actionItems',json('[]'),'isPivot',json('false'),
 'approvedBy',CASE WHEN decisionMaker='AI' THEN NULL ELSE NULLIF(decisionMaker,'') END,
 'decisionConfirmedDate',NULL,'feedbackSourceType',NULL,'feedbackSourceDetail',NULL,'feedbackReceivedDate',NULL,
 'rawEvidence',json('[]'),'evidenceHash',NULLIF(evidenceHash,''),'rawTranscript',NULLIF(evidenceSummary,''),
 'source',json_object('guildId',guildId,'channelId',channelId,'triggerMessageId',messageId,'participants',json(participants),'rawMessages',json('[]')),
 'createdAt',CASE WHEN typeof(createdAt) IN ('integer','real') THEN strftime('%Y-%m-%dT%H:%M:%fZ',createdAt/1000.0,'unixepoch') ELSE strftime('%Y-%m-%dT%H:%M:%fZ',createdAt) END,'updatedAt',CASE WHEN typeof(updatedAt) IN ('integer','real') THEN strftime('%Y-%m-%dT%H:%M:%fZ',updatedAt/1000.0,'unixepoch') ELSE strftime('%Y-%m-%dT%H:%M:%fZ',updatedAt) END,
 'governanceScore',governanceScore,'governanceReason',governanceReason,'governancePassed',json(CASE WHEN governancePassed THEN 'true' ELSE 'false' END)
) WHERE domainJson IS NULL;
-- Preserve omitted optional fields for legacy values with no evidence/link.
UPDATE Decision SET domainJson=json_remove(domainJson,'$.evidenceHash') WHERE json_type(domainJson,'$.evidenceHash')='null';
UPDATE Decision SET domainJson=json_remove(domainJson,'$.rawTranscript') WHERE json_type(domainJson,'$.rawTranscript')='null';
UPDATE Decision SET domainJson=json_set(domainJson,'$.source.messageUrl',sourceJumpUrl) WHERE sourceJumpUrl<>'' AND json_type(domainJson,'$.source.messageUrl') IS NULL AND id IN (SELECT id FROM StorageArchive WHERE kind='Decision' AND json_type(dataJson,'$.domainJson')='null');
UPDATE Decision SET storageVersion=1,
 status=json_extract(domainJson,'$.state'),
 lifecycle=CASE json_extract(domainJson,'$.state') WHEN 'Decided' THEN 'CONFIRMED' WHEN 'Superseded' THEN 'SUPERSEDED' WHEN 'Deferred' THEN 'ON_HOLD' WHEN 'Rejected' THEN 'DISCARDED' ELSE 'IN_REVIEW' END,
 category=COALESCE(json_extract(domainJson,'$.categoryTag'),'기타'),
 topic=json_extract(domainJson,'$.topic'),
 guildId=json_extract(domainJson,'$.source.guildId'),
 channelId=json_extract(domainJson,'$.source.channelId'),
 title=COALESCE(json_extract(domainJson,'$.title'),json_extract(domainJson,'$.topic')),
 supersedesId=json_extract(domainJson,'$.supersedesId'),
 supersededById=json_extract(domainJson,'$.supersededById'),
 evidenceHash=COALESCE(json_extract(domainJson,'$.evidenceHash'),''),
 confirmedAt=CASE WHEN json_extract(domainJson,'$.decisionConfirmedDate') IS NULL THEN NULL ELSE CAST(strftime('%s',json_extract(domainJson,'$.decisionConfirmedDate')) AS INTEGER)*1000+CAST(substr(strftime('%f',json_extract(domainJson,'$.decisionConfirmedDate')),4,3) AS INTEGER) END;
CREATE TABLE _StorageGuard(valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO _StorageGuard SELECT CASE WHEN EXISTS(SELECT 1 FROM Decision WHERE storageVersion<>1 OR NOT json_valid(domainJson) OR json_type(domainJson,'$.state') IS NOT 'text' OR json_type(domainJson,'$.topic') IS NOT 'text' OR json_type(domainJson,'$.decision') IS NOT 'text' OR json_extract(domainJson,'$.topic')='' OR json_extract(domainJson,'$.decision')='' OR json_extract(domainJson,'$.createdAt') IS NULL OR json_extract(domainJson,'$.id') IS NOT id OR json_extract(domainJson,'$.state') NOT IN ('Draft','Proposed','Discussing','Decided','Deferred','Rejected','Superseded') OR json_type(domainJson,'$.source') IS NOT 'object') THEN 0 ELSE 1 END;
DROP TABLE _StorageGuard;
