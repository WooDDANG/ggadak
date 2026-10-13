# 04 — Continuous Scan Coverage and Checkpoints

Type: task
Status: resolved
Blocked by: 03

## Scope

Implement scan coverage in [spec.md](../spec.md), following ADR-0020. Replace trigger-based checkpoint writes and failure advancement with persisted Scan Range completion and a monotonically advancing contiguous checkpoint.

## Acceptance

- [x] Isolated event analysis never advances whole-channel scan progress; BE analysis no longer independently saves its trigger as checkpoint.
- [x] Failed range holds progress before the gap while later successful ranges remain recorded and visible.
- [x] Recovery advances through contiguous completed ranges; old acknowledgements cannot regress the checkpoint.
- [x] Pending ranges resume after restart even if the channel already has a checkpoint.
- [x] Limited/hour-based/full scans and initial backfill accurately declare boundaries and do not claim omitted history.
- [x] Pagination and snowflake comparisons retain chronological ordering and integer precision.

## Comments

Implementation authorized by the user invoking implement-spec. Test first-range failure, out-of-order range completion, lost checkpoint acknowledgement and bounded initial coverage.

## Answer

Implemented durable Scan Range metadata in the Bot journal and BE snapshots. Scans traverse Discord history with BigInt snowflake ordering, bounded initial lookback/limits, explicit lower boundaries and 100-message ranges. Failed ranges remain queued while later ranges complete. Planned work advances independently of continuously completed coverage; omitted manual-scan gaps cannot move either boundary. Completion is persisted before monotonic checkpoint acknowledgement. Restart recovery runs even for channels with checkpoints, and lost acknowledgements retry without regressing. Checkpoint HTTP control requires Bot service authentication; failed checkpoint reads cannot become a new starting boundary.

Evidence: `apps/bot/src/services/scan-coverage.test.ts` verifies failed-first/later-completed recovery across restart, lost acknowledgement, bounded gaps, event isolation, 205-message pagination, large snowflakes, bounded backfill and unavailable checkpoint reads. `apps/be/tests/reliability.api.test.ts` verifies authenticated monotonic HTTP writes. `tests/e2e/recovery.test.ts` connects persisted Scan Range recovery to real HTTP analysis and Web retry.
