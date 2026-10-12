# Dashboard summary

GET `/api/v1/dashboard?guildId=...` requires authenticated guild membership. All counts, recent records and sync jobs are read with the selected guild predicate in one SQLite transaction. Counts cover current lifecycle CONFIRMED, ON_HOLD and IN_REVIEW; rejected and SUPERSEDED history are retained but excluded. Recent cards are the latest five current CONFIRMED decisions, ordered by confirmedAt descending, createdAt descending and string ID ascending. Legacy decisions without confirmedAt follow dated decisions and show “확정일 미기록”; no date is invented.

`sync.lastSuccessfulAt` is completedAt of the latest COMPLETED Sync Job, never creation time, checkpoint time or failed completion time. `latestJob` is the latest created guild job and exposes QUEUED, PROCESSING, COMPLETED or FAILED with actual channel counters and error. A new running/failed job does not erase the last success. Empty servers return zero counts, no cards, null lastSuccessfulAt and null latestJob.

The dashboard uses generated clients, polls every two seconds while mounted, and refetches on navigation. Successful review and accepted/terminal sync jobs invalidate its server-specific cache; terminal sync also invalidates Review Queue. The model/ERD remains Decision plus SyncJob as documented in [v1 model](../diagrams/v1-data-model.md); no new table is needed.

Validation: HTTP flow covers empty data, review-driven counts, five-card order, active/failed sync and retained success time, authentication and guild isolation. The frontend client test checks guild scope, summary display data and surfaced HTTP failures. No operating database was modified.
