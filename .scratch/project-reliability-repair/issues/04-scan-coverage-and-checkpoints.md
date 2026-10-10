# 04 — Continuous Scan Coverage and Checkpoints

Type: task
Status: ready-for-agent
Blocked by: 03

## Scope

Implement scan coverage in [spec.md](../spec.md), following ADR-0020. Replace trigger-based checkpoint writes and failure advancement with persisted Scan Range completion and a monotonically advancing contiguous checkpoint.

## Acceptance

- [ ] Isolated event analysis never advances whole-channel scan progress; BE analysis no longer independently saves its trigger as checkpoint.
- [ ] Failed range holds progress before the gap while later successful ranges remain recorded and visible.
- [ ] Recovery advances through contiguous completed ranges; old acknowledgements cannot regress the checkpoint.
- [ ] Pending ranges resume after restart even if the channel already has a checkpoint.
- [ ] Limited/hour-based/full scans and initial backfill accurately declare boundaries and do not claim omitted history.
- [ ] Pagination and snowflake comparisons retain chronological ordering and integer precision.

## Comments

Implementation authorized by the user invoking implement-spec. Test first-range failure, out-of-order range completion, lost checkpoint acknowledgement and bounded initial coverage.
