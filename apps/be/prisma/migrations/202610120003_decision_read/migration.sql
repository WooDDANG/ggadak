ALTER TABLE Decision ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'IN_REVIEW';
ALTER TABLE Decision ADD COLUMN category TEXT NOT NULL DEFAULT '기타';
ALTER TABLE Decision ADD COLUMN topic TEXT NOT NULL DEFAULT '';
UPDATE Decision SET lifecycle = CASE COALESCE(json_extract(domainJson, '$.state'), status)
 WHEN 'Decided' THEN 'CONFIRMED' WHEN 'confirmed' THEN 'CONFIRMED'
 WHEN 'Deferred' THEN 'ON_HOLD' WHEN 'Rejected' THEN 'DISCARDED' WHEN 'rejected' THEN 'DISCARDED'
 WHEN 'Superseded' THEN 'SUPERSEDED' ELSE 'IN_REVIEW' END,
 category = COALESCE(json_extract(domainJson, '$.categoryTag'), json_extract(tags, '$[0]'), '기타'),
 topic = COALESCE(json_extract(domainJson, '$.topic'), title);
CREATE INDEX Decision_guildId_lifecycle_category_createdAt_idx ON Decision(guildId, lifecycle, category, createdAt);
