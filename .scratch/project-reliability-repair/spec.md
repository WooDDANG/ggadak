# Project Reliability Repair

Status: resolved

## Problem

The project builds and its current tests pass, but production behavior can lose access to stored decisions after restart, advance checkpoints after failed analysis, discard semantic-only triggers, and apply inconsistent review transitions. Debounce replacement also leaves pending callers and processing reactions. Passing E2E tests currently use a legacy extraction engine and may call external AI, so they do not establish production-path reliability.

## Agreed scope

Implement the 18 decisions accepted in the design interview. Keep the existing Bot/BE/FE monorepo, SQLite, Prisma, and TSOA/Orval boundary. Repair application behavior, add schema migrations and recovery UI, and verify against isolated databases and injected AI. Deployment and changes to live SQLite files are outside this implementation effort.

Architecture decisions: [ADR-0018](../../docs/adr/0018-durable-analysis-and-database-authority.md), [ADR-0019](../../docs/adr/0019-web-owned-decision-review.md), [ADR-0020](../../docs/adr/0020-analysis-delivery-and-scan-coverage.md).

## Database authority and migration

- All Decision, feedback, rejected-evidence, request-result, and checkpoint reads use persistent storage. Successful writes are awaited; database failure must not become a successful in-memory result.
- Await application initialization before accepting requests. Database readiness failure prevents normal startup rather than merely logging a warning and continuing.
- Preserve all current domain fields, including topic, decision content, summaries/quotes, alternatives, category, Action Items, source messages, approval time, governance, replacement links, and original creation time. Review updates must persist the displayed content, category, approver, and timestamps.
- Give mutable review records a version. Action Items need stable identity, completion/disposition state, and transfer provenance. Existing items have unknown completion until reviewed; migration must not invent completion, evidence, approval, or historical task ownership.
- Inspect both existing SQLite locations without exposing secrets, record which configured path is active, and provide a migration path for the other file if it contains relevant records. Use backups and fixture copies; do not silently merge colliding IDs or replace a live file. Report conflicting legacy records for resolution if found.
- Add checked-in Prisma migrations and explicit generation/migration commands. Test migration and round-trip recovery on copies of legacy-schema fixtures.

## Analysis identity and candidate history

- Durably assign an Analysis Request ID before delivery and keep it across retries. Store a payload fingerprint so reusing an ID with different content returns a conflict instead of an unrelated cached result.
- Persist request claiming/completion state. Concurrent deliveries of one ID must not create duplicate candidates. Commit extracted candidates and the completed request result atomically. Recover abandoned in-progress claims after a crash.
- A retry after a committed but lost response returns the stored result, including a completed no-decision response, without invoking AI again. Crash recovery may repeat an interrupted AI call, but cannot repeat committed candidate creation.
- Distinguish request deduplication from candidate equivalence. Across different requests, reuse candidates only for identical canonical evidence and normalized decision content within the same guild. Keep distinct decisions from the same discussion.
- Canonical evidence preserves original message IDs and content, source scope, and stable ordering. Compute identity before destructive preprocessing; preserve original IDs through burst merging and replies. Exclude Bot processing reactions and delivery metadata from candidate identity.
- Exact candidate reuse does not overwrite reviewer edits or change its Decision State. Partial overlap or changed wording remains visible as a related candidate, not an automatically discarded item.
- Manual reanalysis receives a new request ID and bypasses rejected-evidence suppression. Record its relationship to prior requests/candidates and preserve confirmed/rejected history. If it reproduces the exact same candidate, reuse and record the new analysis relationship without resetting its state; changed content produces a linked Draft.
- Suppression must not reject unrelated decisions merely because they occurred in the same large input window. Keep legacy rejected hashes effective for their original exact evidence scope.

## Durable delivery and failure recovery

- Bot-local persistent Egress Queue survives a BE outage and Bot restart. It stores requests, attempts, next retry time, original trigger, optional Scan Range, and final results/errors. Share one scheduler across startup, event, reaction, and command entrypoints.
- Run at most one analysis per channel. Pending triggers are retained; manual requests bypass debounce but not an active execution. A waiting retry releases the channel so eligible later work can run.
- Coalesce debounce triggers while settling all callers with an explicit merged/canceled/completed outcome. Preserve relevant trigger context and clean obsolete processing reactions.
- Separate completed-with-candidates, completed-with-no-decision, retry-pending, and retained-failure outcomes. Commands must not report a queued or failed scan as fully completed.
- Configurable initial retry defaults: five total attempts, exponential delay beginning at 5 seconds, capped at 5 minutes, with jitter. Network errors/timeouts, 429, and 5xx are retryable; invalid payloads, authentication/configuration errors, and unavailable models are retained failures needing intervention. Bounded request timeouts must release execution slots.
- AI failure, invalid structured AI output, and missing production credentials cannot produce heuristic success. Explicit development/test fallback stays available; normal no-decision AI output is a successful analysis.
- Publish queue status to BE when connectivity permits; Web displays last synchronization time. The Bot remains authoritative for local queue execution. A Web retry command is claimed by the Bot and changes the same retained request back to pending. During disconnection the Web reports unavailable/stale queue status rather than implying live control.
- Production model/provider selection is configurable and is not hardcoded to an API model that failed during review. Operational configuration of a valid model remains deployment work.

## Scan coverage

- Channel Checkpoint marks continuously completed scan coverage, not the latest event trigger. BE discussion analysis must not independently move it.
- Bot durably records bounded Scan Ranges and successful completion. Later ranges can complete around a failure, but the checkpoint cannot cross a gap. After recovery, advance to the end of the now-continuous completed range.
- Persist completion before checkpoint acknowledgement. If checkpoint delivery fails, retry monotonically; an old retry must not move the stored boundary backwards.
- Events and limited/hour-based/manual scans establish only their actual coverage and cannot claim earlier unscanned history. Initial bounded backfill records an explicit starting boundary; it does not claim to cover all past history.
- Resume pending scan work after restart even when a checkpoint exists. Respect the configured lookback/scan boundaries and Discord pagination ordering; compare snowflake IDs without losing integer precision.

## Shared admission and Discord feedback

- Backend policy owns semantic threshold, agreement/reaction rules, and window configuration; Bot and BE use the same validated policy. Retain the existing semantic threshold initially.
- Semantic-only triggers can reach production AI analysis. Manual execution bypasses admission filtering but not validation or channel serialization. Human reactions may admit analysis; Bot-owned 👀/📝 never contribute agreement.
- Preserve relevant consensus/reaction evidence through filtering, merging, and slicing. Semantic admission must be evaluated against the relevant original trigger/session rather than lost during preprocessing.
- Automated Discord channel output stays reaction-only. 👀 means active analysis; 📝 appears only after a candidate is durably recorded or reused. Normal no-decision, failure, coalescing, and cancellation clean processing reactions. Remove only the Bot's reaction, not users' reactions.
- Existing private slash-command responses provide a configured Web review link and accurate pending/completed/failed counts. Retire obsolete Discord conflict approval behavior.

## Web-owned review

- Ordinary confirmation and Independent Retention confirm a candidate without changing existing records. Topic matches only nominate comparison records from the same guild; they do not automatically establish conflict or Pivot.
- Replacement requires an explicit predecessor and a disposition for every unfinished Action Item: cancel or transfer. Completed items remain in predecessor history; transfers retain provenance. Resolve unknown legacy completion through explicit reviewer classification, not a fabricated migration default.
- In one transaction, verify current candidate/predecessor versions and predecessor Decided state, apply reviewer edits, mark predecessor Superseded, confirm successor, and apply Action Item dispositions. A failed transaction changes none of these.
- Stale review returns a conflict response; FE reloads current records and requires renewed review. Two reviewers cannot successfully replace the same predecessor independently.
- Keep Supersede distinct from strategic Pivot. Neither matching Topic nor replacement alone forces isPivot=true.
- Use the existing review API as the authoritative workflow. Generate typed API contracts for version, resolution, predecessor, and Action Item disposition; any retained legacy conflict endpoint delegates to the same validated transaction rather than returning unconditional success.
- Review Queue shows related candidates, replacement selection, Action Item choices, reanalysis history, and stale-review recovery. It also exposes retained analysis failures and retry status without showing implementation details unrelated to the reviewer's decision.

## Verification

Use the production DiscussionService/AiAdapter interface with injected deterministic results and isolated databases. Automated tests must not invoke paid/external AI or modify live data.

1. Save full decisions, feedback, rejection and checkpoints; restart services and compare recovered fields. Verify edited content/category/approval and original timestamps survive.
2. Fail a database write and assert no successful API response. Verify startup waits for database and route readiness.
3. Lose an analysis response after commit, resend it, and assert identical candidate IDs and one AI invocation. Concurrent deliveries and a crash before commit cannot duplicate committed candidates.
4. Fail the first scan range and complete the next; checkpoint stays before the gap, later results remain visible, and recovery advances correctly. Replayed old checkpoints cannot regress it.
5. Restart Bot with queued work and unavailable BE; recover delivery and Web retry. Permanent/exhausted failures remain visible and are not silently completed.
6. Exercise rapid triggers, in-flight triggers, manual overrides and debounce replacement; no caller remains pending and no obsolete Bot 👀 survives. Command-created engines must not bypass the shared channel lock.
7. Semantic-positive/regex-negative Korean and English examples reach AI; noise is rejected; Bot reactions do not satisfy human reaction thresholds.
8. Overlapping evidence retains distinct decisions, exact reuse preserves reviewer state, and manual reanalysis preserves previous confirmation/rejection history. Merged message reply targets remain intact.
9. Replacement updates both states and task dispositions across restart. Draft save and Independent Retention do not modify the predecessor. Stale/double approval returns conflict and leaves data consistent.
10. Include root-level BE server tests in the normal test command, retire hardcoded legacy E2E injection, validate typed input payloads, regenerate API artifacts, and test FE stale-review/error/retry behavior.

Required final checks: build, normal full test command, lint, and format check for touched source/config files. Existing unrelated formatting drift should be reported rather than rewritten wholesale.

## Delivery sequence

01 database authority → 02 idempotent analysis → 03 durable delivery → 04 scan coverage → 05 admission/feedback. Work on 06 review after 01; integrate 07 Web after 03 and 06; finish 08 regression verification across all tickets. Ticket completion is based on passing behavioral acceptance criteria, not presence of scaffolding.

## Implementation completion

All eight implementation tickets are resolved. See [verification.md](verification.md) for behavioral evidence and [delivery-operations.md](delivery-operations.md) for deployment configuration.
