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

Queue status and retry APIs are generated for the FE. The recovery screen belongs to ticket 07; continuous Scan Range checkpoint recovery belongs to ticket 04.
