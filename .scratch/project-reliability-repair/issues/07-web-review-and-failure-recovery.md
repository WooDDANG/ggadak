# 07 — Web Review and Failure Recovery

Type: task
Status: ready-for-agent
Blocked by: 02, 03, 06

## Scope

Implement the Review Queue and retained-analysis-failure interfaces described in [spec.md](../spec.md). Generate and use typed API contracts for review versioning, resolution, Action Item dispositions, reanalysis history and failure recovery.

## Acceptance

- [ ] Reviewers can compare related candidates, independently confirm or explicitly select a predecessor, and classify/cancel/transfer unfinished tasks.
- [ ] Reanalysis relationships and confirmed/rejected history remain visible.
- [ ] Stale-review conflict reloads current records and requires renewed review rather than silently overwriting.
- [ ] Failure view shows error category, attempts and synchronization freshness; manual retry has pending/acknowledged/error states.
- [ ] BE outage or disconnected Bot does not appear as successful retry; UI identifies stale/unavailable queue status.
- [ ] Keep product text focused on review/recovery decisions; avoid exposing unnecessary internal request/database details.

## Comments

Implementation authorized by the user invoking implement-spec. Verify reviewer and retry behavior with mocked HTTP responses including conflict and disconnection, plus an isolated integration path.
