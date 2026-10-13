# 07 — Web Review and Failure Recovery

Type: task
Status: resolved
Blocked by: 02, 03, 06

## Scope

Implement the Review Queue and retained-analysis-failure interfaces described in [spec.md](../spec.md). Generate and use typed API contracts for review versioning, resolution, Action Item dispositions, reanalysis history and failure recovery.

## Acceptance

- [x] Reviewers can compare related candidates, independently confirm or explicitly select a predecessor, and classify/cancel/transfer unfinished tasks.
- [x] Reanalysis relationships and confirmed/rejected history remain visible.
- [x] Stale-review conflict reloads current records and requires renewed review rather than silently overwriting.
- [x] Failure view shows error category, attempts and synchronization freshness; manual retry has pending/acknowledged/error states.
- [x] BE outage or disconnected Bot does not appear as successful retry; UI identifies stale/unavailable queue status.
- [x] Keep product text focused on review/recovery decisions; avoid exposing unnecessary internal request/database details.

## Comments

Implementation authorized by the user invoking implement-spec. Verify reviewer and retry behavior with mocked HTTP responses including conflict and disconnection, plus an isolated integration path.

## Answer

Implemented analysis recovery in the Web Review Queue with error categories, attempts, named channels, last synchronization, stale/unavailable control and pending/acknowledged/error retry states. Retries retain the server-returned command identity when coalesced; response-loss replay uses the same command. Authenticated guild-scoped candidate-history API and typed FE clients show related candidate content, confirmed/rejected/superseded records, manual reanalysis and earlier-analysis links. Independent confirmation and explicit predecessor/task disposition remain supported; selected predecessor content and Rationale are shown for comparison.

Review conflicts await fresh queries, reset selection/task choices and require renewed review. A failed refresh cannot claim that fresh records were loaded. Confirmed/rejected history remains accessible even with an empty pending queue, and confirmed Decision detail also shows analysis history.

Evidence: FE mocked-HTTP/SSR tests cover unavailable retry controls, acknowledged commands, transport failure, conflict refresh without resubmission, related rejected content and replacement eligibility. Isolated BE HTTP tests cover history authorization, rejected-candidate preservation after exact manual reanalysis and idempotent Web retry coalescing. `tests/e2e/recovery.test.ts` verifies actual Bot claiming/acknowledgement and normal no-decision completion.
