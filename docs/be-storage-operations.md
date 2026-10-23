# BE storage upgrades and bounded session concurrency

The active SQLite database is selected by root DATABASE_URL, relative to the Prisma schema for file URLs. Use the root npm commands; the old BE environment file must not shadow root configuration. DB inspection does not apply migrations or create a missing database.

Local development startup (`npm run dev`, `npm run dev:all`, or `npm run dev:be`) prepares shared code and the Prisma Client, then applies pending migrations through the backed-up upgrade workflow before BE starts. A preparation failure stops startup. An already-current schema skips backup and migration, including repeated preparation by the BE workspace hook. `npm start` does not apply migrations; production upgrades remain an explicit maintenance operation.

## Upgrade workflow

1. Build the BE and regenerate the Prisma Client with the checked-in schema.
2. Run `npm run db:check`. It reports the absolute selected DB path, unapplied migrations and missing tables/columns without printing credentials. BE readiness checks the full generated schema, including background-worker tables.
3. Run `npm run db:upgrade -- --database /absolute/path/to/selected.sqlite` to preview the target and pending migrations. Schedule a maintenance window for the schema contraction: old BE binaries cannot use the final schema.
4. Stop BE writers, then run the same command with `--apply`. It first makes a consistent SQLite backup, backfills legacy domain payloads in small batches, and applies expand/data/contract migrations. Never run against a target selected only by an ambiguous working directory.
5. Run `npm run db:audit -- --database /absolute/path/to/selected.sqlite`, then restart BE and verify receipt, fixture analysis, review and graph/history reads.

`db:backup` makes a backup without migration. `db:backfill -- --database ... --apply --batch-size 100` can perform the resumable legacy conversion separately before schema contraction. Read/write version checks skip conflicting updates; rerun after conflicts instead of overwriting concurrent edits. Unknown or invalid historical values must be investigated rather than invented. The final data migration is a locked maintenance operation; the standalone batched backfill reduces its conversion work.

Removed Decision fields, original feedback metadata, rejection reasons, redundant settings and old candidate links are preserved in StorageArchive. The archive has an independent lifetime and deliberately has no cascading relation to a live entity. It is historical recovery material, not another continuously maintained Decision representation. New decisions use a validated versioned domain payload and query projections; the audit command detects invalid payloads and mismatched projections without changing data.

If migration or validation fails, keep BE stopped. Restore the printed backup to the selected DB with a SQLite backup/restore operation and deploy the matching previous BE version. Close all BE/Studio connections first; do not copy a live DB file while ignoring WAL/journal sidecars. Preserve the failed target and migration output for investigation. No automatic restore or destructive reset is performed.

## Analysis state

AnalysisRequest retains the immutable request and workflow descriptor. AnalysisSessionState stores immutable preprocessed session input separately from mutable checkpoints. Existing version-1 workflows are still readable and convert atomically when resumed. Per-session fenced updates and a request-local write queue prevent sibling checkpoints from overwriting one another. Completed graph snapshots, result replay, reviewer changes and the existing retention contract remain independent.

Candidate relationships are indexed rows with reverse lookup; prior request IDs remain a historical snapshot. Decision, candidate, analysis and edit references use restrictive deletion policies. Feedback is channel/global feedback and has no fabricated Decision relationship.

## Concurrency settings

- `ANALYSIS_CONCURRENCY`: concurrent requests admitted across BE processes; same-channel request serialization remains in effect.
- `AI_SESSION_CONCURRENCY`: workers processing independent sessions within one request.
- `AI_CALL_CONCURRENCY`: simultaneous AI stage calls shared by processes using the same DB.

Defaults are 1 and supported values are integers 1 through 32. This ceiling is a validation bound, not an optimal operating value. Each session preserves extract/check/verify/repair order. Global AI admission is FIFO, cancellable and leased; CLI termination is awaited before returning a permit. Slot waiting is measured separately from active AI time and is not charged as a generation attempt. All BE instances sharing a provider quota should use the same DB/admission boundary. If configurations differ during rollout, admission uses the smallest active/waiting caller limit.

Completed sessions remain reusable after a sibling fails. On failure, queued sibling work stops, running siblings are cancelled and drained, and partial candidates are not published. The current queue worker still admits one queued request at a time per BE instance; session parallelism works inside that request.

## Measuring N

After building, run an offline harness using the production workflow and isolated databases:

```bash
npm run ai:benchmark -- --ns 1,2,4 --rounds 3 --output .data/evaluation/concurrency-fixture.json
```

It uses short/long sessions, multiple channels and bounded repair. Reports include completed sessions/minute, request completion (admission through final commit, including worker queues/checkpoints) and permit-wait p50/p95; active AI-stage p95 is reported separately, error diagnostics, DB operation/error counts, DB read latency and sampled process-tree RSS/CPU. Process-tree sampling needs local `ps` permission; unavailable samples prevent a recommendation instead of becoming zero usage. CPU samples are OS process lifetime averages, not instantaneous profiling. Sampling can miss short-lived peaks; use deployment monitoring to corroborate sustained load. Optional `--probe-url` measures a successful service read/login-state endpoint. BENCHMARK_COOKIE may supply an existing session cookie and is never included in the report.

Live measurements require an explicit input dataset, model, environment label and positive call/token/output/duration budgets. They use an isolated analysis DB and the active service DB for shared AI admission; prepare its schema first. The input is a JSON array of normal analysis requests. Keep dataset/model/account/environment the same across N values. Baseline N=1 is always included. Set workload limits and thresholds before running, for example:

```bash
npm run ai:benchmark -- --live --input /absolute/path/to/benchmark-input.json \
  --model MODEL_SLUG --environment staging \
  --ns 1,2,4 --rounds 3 --max-calls 200 --max-tokens 500000 \
  --max-output-tokens 8192 --max-duration-ms 600000 \
  --probe-url http://localhost:3001/api/v1/auth/me \
  --max-p95-ms 90000 --max-error-rate 0 --max-rss-mib 1024 \
  --max-cpu-percent 150 --max-db-p95-ms 100 --max-probe-p95-ms 200 \
  --output .data/evaluation/concurrency-live.json
```

Choose a real successful probe endpoint for the deployment rather than assuming the example route exists. Recommendations exclude failed calls/probes, resource violations and missing measurements, then select the smallest measured N within 5% of the best eligible throughput. Live runs that exceed the duration budget do not produce a production recommendation. Input bytes/output reservations are conservative application estimates; CLI system context, thinking and provider billing are not exact pre-generation token caps. Reported usage is reconciled after each generation. Fixture suggestions do not establish real AGY account limits and never change environment settings automatically.

Repeat measurements after changing model/account limits, session size distribution or machine resources. If quota errors, timeout, DB contention or service latency rise, restore both AI settings to 1 and investigate. Existing scan-backpressure load/recovery and retention tickets remain the integration checklist; the benchmark does not replace their coverage.
