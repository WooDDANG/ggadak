# Durable Analysis and Database Authority

Status: accepted (design agreed; implementation pending)

SQLite with Prisma remains the storage technology. The backend database is authoritative for decisions, review changes, feedback, rejected evidence, and channel checkpoints. Reads must survive restarts. Writes must complete before the API reports success; memory-only operation after database failure is not a production fallback.

The Bot durably retains analysis requests and retries failures across backend outages and process restarts. Only completed analysis, including a normal no-decision result, counts as processed. This extends [ADR-0007](./0007-sqlite-persistent-egress-queue.md)'s reliable delivery principle to analysis requests following centralized backend extraction. The queue described there is not currently implemented.

Production AI failures remain failed attempts eligible for retry rather than producing heuristic Decision Candidates. Deterministic fallback parsers are restricted to explicit development and test modes. Tests inject fixed AI responses into the production analysis pipeline without external calls. This favors trustworthy evidence over immediate availability of approximate candidates.

Before migration, inspect and back up both existing SQLite files, explicitly select one active database path, and expand the schema to preserve the full Decision domain. Missing historical evidence, approvers, and Action Items must remain missing rather than being invented. Migration is additive and preserves existing records.

Request identity, bounded retry, ordering, checkpoint coverage, candidate equivalence, and reanalysis boundaries are refined in [ADR-0020](./0020-analysis-delivery-and-scan-coverage.md).
