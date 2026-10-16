# Two-queue operations

The Bot Egress Queue retains unconfirmed deliveries. BE stores input and processing intent atomically, acknowledges receipt, and owns subsequent AI retries. Bot result feedback runs independently, acknowledges only successful application and can replay BE results after a restart. Confirmed results move out of the active Bot journal so idle polling does not revisit all completed payloads.

## Deployment

Back up the selected active SQLite database using SQLite's backup API before deploying the additive `202610170001_analysis_queue` migration. Do not copy a live database file without accounting for its WAL. Keep the Bot journal and transfer directory on persistent storage with exactly one Bot process owning that directory.

1. Deploy the expanded BE schema with `npm run db:migrate --workspace=@ggaddak/be`, then generate Prisma using `npm run db:generate --workspace=@ggaddak/be`.
2. Build BE, Bot, Shared and regenerate API clients with the checked-in commands. Restart BE with the migrated database.
3. Enable `ANALYSIS_ASYNC_DELIVERY=true` on BE and Bot. Start Bot after BE. The default is enabled outside automated compatibility tests; false retains the synchronous API for rollout compatibility. Never run independent old and new Bot producers against the same journal.
4. Retained old deliveries reuse their IDs. Completed legacy Analysis Requests are adopted without another AI call; in-progress old owners continue under their lease and do not consume the delivery retry budget merely because work is still running.

This implementation's automated validation uses isolated migrated databases and fake Discord/AI. It does not migrate the active workspace database, perform a real Discord scan or issue paid AI requests.

## Limits and recovery

Defaults: one globally leased analysis execution, per-channel exclusion, five foreground jobs before a ready scan opportunity, 100 messages/256 KiB per receipt, 256 MiB of BE transfer copies, 64 MiB per channel, 2,000 unfinished receipts and 64 MiB physical disk reserve. Scans can consume at most 90% of the receive bytes/count budget, leaving room for live/manual inputs. `ANALYSIS_CONCURRENCY`, `ANALYSIS_FOREGROUND_BURST`, `ANALYSIS_QUEUE_*`, `BOT_JOURNAL_MAX_BYTES` and `BOT_SCAN_MAX_BYTES` are configurable. Bot journal default budget is 256 MiB with headroom for acknowledgement metadata; physical reserve applies separately.

An input exceeding a segment/channel limit is an explicit capacity failure. Accepted partial data and frozen boundaries remain retained. Increase the relevant configured limit before resuming the same transfer ID; never label the incomplete channel successful or erase failed input to make space. Temporary full capacity uses delayed retry rather than another full scan. Global physical disk shortage requires operator action before more receipt is accepted.

BE workers retry transient failure with bounded exponential delay/jitter, honoring a valid provider Retry-After. Backoff consumes no execution slot. Permanent validation failure requires a new manual analysis; exhausted transient failure can be retried from the Web using retained BE input even if Bot is disconnected. Delivery failure before receipt remains Bot-owned.

Synchronous compatibility calls and asynchronous workers share the same DB execution leases. A crash after a provider executes but before its result is persisted may repeat the external AI call; persisted completion is idempotent and repeated delivery does not create another Decision Record.

## Observe

The service-authenticated capacity endpoint exposes per-state counts/bytes, oldest waiting age, scan admission and provider pause. Result views expose received/start/completion times; Bot records enqueue/receipt/feedback times. The Web separates received channels from completed analysis and shows backend-owned retry state. Compare same-process durations when diagnosing network vs queue vs AI latency; clocks on different hosts can differ. Inputs and credentials are not metric labels.

Bot heartbeat remains every five seconds with a 15-second freshness threshold. Unchanged completion rows are not rewritten. The recovery sweep is coalesced; result application retries have bounded delay. New-path checkpoints are BE-owned and updated on completed analysis, while unchanged legacy coverage is not repeatedly read.

## Retention

After result application is acknowledged and the default seven-day retention passes, BE clears the redundant receipt input copy, retaining its ID/fingerprint/result identity. Scan copies additionally require safe analyzed coverage. AnalysisRequest graph/evidence and reanalysis inputs remain retained for existing features; this is not a blanket purge of user-visible evidence. Actual filesystem free space, not SQLite logical row deletion, gates physical capacity.

Bot compacts acknowledged archived results into replay tombstones and removes eligible fully analyzed transfer pages; failed or incomplete transfer pages remain. The manifest and replay fingerprint remain, and unconfirmed feedback/input is never deleted automatically. `ANALYSIS_COMPLETED_RETENTION_MS` controls the interval; each maintenance pass is bounded.

Discord slash scan replies distinguish data delivery from analysis completion and link to Web results. For long-running scans the persisted Web result is authoritative; the slash reply is a handoff, not proof that AI has finished.

## Implementation validation (2026-10-17)

The implementation and review fixes are committed on the working branch. Queue receipt/scan states are shared TypeScript enums (`AnalysisReceiptState`, `AnalysisScanState`) and exposed as enum schemas in generated OpenAPI/FE clients. Stored SQLite columns remain strings for compatibility; response projections validate their values. This does not add a database enum constraint.

The full offline suite passed: Shared 15, BE 125, Bot 40, FE 15, E2E 8. After the final bounded cleanup cursor fix, BE queue 9 and Bot asynchronous-delivery 5 tests passed again. Type checking passed; lint has zero errors and one existing unused-import warning in shared logger tests. Test fixtures use isolated databases, fake Discord and fake AI. These timings are local fixture measurements and do not establish production login/dashboard latency or real Discord throughput.

Standards and spec reviews found and fixed repository boundary violations, capacity-blocked resume/seal, stale failed job summaries after analysis recovery, ACK/archive crash recovery, and cleanup starvation after the first 50 records. No remaining documented standards breach or blocking spec issue was identified in the final reviews.

Discord history is collected to a bounded on-disk spool, checking BE capacity per page, then uploaded oldest-first in receipt-confirmed ranges. It does not stream each Discord fetch page directly to BE: Discord pagination runs newest-first while analysis coverage runs oldest-first. A collected transfer may replay receipt/seal when admission is full; the BE still enforces receipt limits atomically. Bot cleanup persists its scan cursor across restarts; BE cleanup rotates by receipt ID in-process and restarts scanning safely after process restart.

The ticket checklists remain the detailed acceptance record; production load measurements and deployment are not implied by these offline checks.
