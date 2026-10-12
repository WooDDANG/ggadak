# 03 — Durable Delivery and Channel Scheduling

Type: task
Status: resolved
Blocked by: 02

## Scope

Implement the durable delivery section of [spec.md](../spec.md). Add Bot-local persistent analysis delivery and one scheduler shared by startup, events, reactions and slash commands. Replace dual locks and dropped triggers, and make production AI/configuration failures explicit.

## Acceptance

- [x] Queue identity and pending/retry/failed state survive Bot restart and BE outage.
- [x] One analysis executes per channel; later work remains eligible while earlier retries wait.
- [x] Manual triggers bypass debounce without bypassing serialization; all coalesced/canceled callers settle.
- [x] Completed-no-decision, queued, transient failure and retained failure are distinct outcomes.
- [x] Retry count, jitter/backoff, request timeout and permanent error classification are configurable and bounded.
- [x] Production AI failures do not produce heuristic candidates; tests/development have explicit fallback mode and configurable provider/model.
- [x] Queue status synchronizes to BE when reachable and accepts idempotent Web retry commands; disconnects report stale/unavailable status.

## Comments

Implementation authorized by the user invoking implement-spec. Test scheduler through all entrypoints, including commands that currently construct new engine instances. Use fake AI/network seams; no external AI calls.

## Answer

Implemented on `codex/reliability-03-resume`, continuing the completed backend architecture refactor on `main`.

- Persist requests before waiting for channel execution. Preserve original payload/identity, attempts, retry deadline, retained errors, final results and Web retry command IDs across Bot restart; completed replay does not send again. Manual reanalysis uses a fresh identity.
- One process-wide channel scheduler controls delivery from startup scans, messages, reactions, slash-command-created engines, sync jobs and recovery. Waiting retries release the channel; in-flight triggers are retained. Removed both dropping locks and their unsafe manual/TTL bypasses.
- Debounce replacement settles previous callers as merged, cancellation settles callers as canceled, and all coalesced original triggers remain in the harvested evidence. Processing reactions start with actual execution; cleanup removes only the Bot's reaction.
- Retry policy defaults to five total attempts, 5-second initial exponential delay, 5-minute cap and 20% jitter. Configuration is bounded/validated. HTTP deadlines include response-body consumption. Network/timeout, 408, 429 and 5xx retry; permanent 4xx or invalid results retain failure. Commands no longer label failed or queued scans complete.
- Persist BE queue snapshots, a connection heartbeat and retry commands through an additive Prisma migration. Authenticated Web access is guild scoped; reviewer permissions are required for retry. Bot acknowledgement and command replay are idempotent; stale/disconnected state is explicitly unavailable. Regenerated TSOA and FE contracts.
- Provider/model settings are configurable and loaded after environment discovery. Production configuration/provider/structured-output failures propagate without mock success; explicit development/test mock remains available.

Validation: `npm test` passes all 120 tests (Shared 15, BE 70, Bot 24, FE 9, E2E 2), including isolated migration, HTTP authorization, queue replay/restart, timeout/body stall, durable waiting, debounce/cancellation and every processing entrypoint. Build is included in that command. `npm run typecheck`, `npm run lint`, touched-source Prettier check and `git diff --check` pass. Lint retains one existing unused-import warning in `packages/shared/src/logger.test.ts`. HTTP tests ran with local-port permission after sandbox EPERM; AI/network seams are injected and databases isolated.

Storage note: the existing fsynced analysis file journal was extended instead of replacing it with ADR-0007's proposed SQLite Bot queue. This difference and deployment configuration are recorded in [delivery-operations.md](../delivery-operations.md). BE snapshots/retry commands use Prisma/SQLite. No deployment or live database migration was performed. Continuous Scan Range checkpoint recovery remains ticket 04; the Web failure/recovery screen remains ticket 07.
