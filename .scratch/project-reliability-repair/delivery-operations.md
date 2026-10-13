# Analysis delivery operational configuration

Ticket 03 extends the existing Bot analysis journal. Keep `ANALYSIS_DELIVERY_DIR` on a persistent volume, with exactly one Bot process using that directory. Completed results, retained failures, attempt counts, original payloads and applied Web retry command IDs survive restart. Existing bare-payload journal files remain readable. Do not delete retained files as part of deployment.

The Bot journal uses file and directory fsync plus atomic publication/replacement. This differs from ADR-0007's original SQLite queue proposal; it continues the file journal already integrated by ticket 02. Backend snapshots and retry commands use the existing Prisma/SQLite database. Revisiting the Bot storage technology requires a separate migration preserving these records.

Apply the checked-in `202610120001_analysis_delivery` migration through `npm run db:migrate --workspace=@ggaddak/be`, and generate Prisma through `npm run db:generate --workspace=@ggaddak/be` during deployment. This implementation only applies migrations to isolated test databases.

Set the same `BOT_SERVICE_TOKEN` on Bot and BE. The Bot publishes status every five seconds; snapshots become unavailable after fifteen seconds without synchronization. Web retry returns an accepted command; `acknowledgedAt` records Bot acknowledgement, while the next queue snapshot records analysis success or retained failure. Replaying a `commandId` observes the same command and never allocates a new retry budget.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANALYSIS_DELIVERY_DIR` | `.data/analysis-deliveries` | Persistent Bot journal directory |
| `ANALYSIS_MAX_ATTEMPTS` | `5` | Total attempts per retry budget |
| `ANALYSIS_RETRY_DELAY_MS` | `5000` | Initial exponential retry delay |
| `ANALYSIS_MAX_DELAY_MS` | `300000` | Maximum delay, including jitter |
| `ANALYSIS_RETRY_JITTER` | `0.2` | Fractional jitter, between 0 and 1 |
| `ANALYSIS_TIMEOUT_MS` | `50000` | Analysis HTTP deadline, including response body |
| `AI_PROVIDER` | `gemini` | `gemini`, `openai`, or explicit development/test `mock` |
| `AI_MODEL` | Provider default | Configured provider model name |

Missing credentials, unsupported providers/models and invalid structured AI output fail explicitly. Production never uses mock extraction. Configure a valid model and credentials operationally; tests use injected providers and never call external AI.

The Web Review Queue now includes the recovery screen and confirmed/rejected history. Scan Ranges persist with queued payloads and completed results; retain those journal files so recovery can acknowledge continuously completed coverage after restart.

Deployment must also apply `202610120002_scan_range` through the migration command above. It adds Scan Range metadata and channel names to BE snapshots. Checkpoint reads/writes now require `BOT_SERVICE_TOKEN`.

`SEMANTIC_THRESHOLD` defaults to `0.7` and is validated between 0 and 1 by the backend policy. The Bot synchronizes policy periodically and retains the last valid policy when synchronization fails. `REVIEW_WEB_URL` (or `WEB_URL`) sets the private scan-command review/recovery link. Initial scans use `SCAN_INITIAL_LIMIT` and `DECISION_LOOKBACK_DAYS`; manual bounded scans do not claim omitted history. Existing checkpoint records are preserved; this change does not fabricate historical Scan Ranges.
