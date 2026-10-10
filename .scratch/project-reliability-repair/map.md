# Project Reliability Repair

## Notes

Whole-project review identified persistence, checkpoint, semantic admission, conflict resolution, and debounce defects. This effort is in design interview; application implementation authorized by the user invoking implement-spec.

## Decisions so far

- Round 1: user accepted SQLite/Prisma database authority, durable analysis retry, Web-owned human review with atomic replacement, semantic admission excluding Bot reactions, and retryable production AI errors instead of heuristic success.
- Database and delivery: [ADR-0018](../../docs/adr/0018-durable-analysis-and-database-authority.md).
- Review ownership and admission: [ADR-0019](../../docs/adr/0019-web-owned-decision-review.md).
- Round 2: user accepted continuous scan checkpoints separate from event analysis, stable retry request IDs, bounded retries with retained visible failures, sequential channel execution without dropped triggers, additive migration preserving both existing files for inspection, human conflict selection within a guild, explicit unfinished Action Item cancellation/transfer, backend-owned shared detection policy, and reaction-only automatic Discord interaction with private review links.
- Delivery and scan coverage: [ADR-0020](../../docs/adr/0020-analysis-delivery-and-scan-coverage.md).
- Round 3: user approved later-range processing without advancing past gaps, conservative candidate reuse requiring identical evidence and content, explicit manual reanalysis preserving rejection/confirmation history, and stale-review rejection with transactional predecessor checks.

- Database authority resolved: async persistent reads/writes, restart-safe full domain, additive legacy migration and safe conflict-reporting tools. [Ticket 01](issues/01-database-authority-and-migration.md).

- Idempotent analysis resolved: durable request replay/fenced claims, atomic candidates and completion, exact reuse preserving review state, original evidence/reply identity and manual/overlap history. [Ticket 02](issues/02-idempotent-analysis-and-candidate-history.md).
- Atomic review resolved: required versions, transactional replacement and explicit task disposition; stale/concurrent review conflicts, compatibility route validation and SQLite rollback/restart verification. [Ticket 06](issues/06-atomic-review-and-action-items.md).

## Implementation map

- [01 — Database authority and migration](./issues/01-database-authority-and-migration.md)
- [02 — Idempotent analysis and candidate history](./issues/02-idempotent-analysis-and-candidate-history.md)
- [03 — Durable delivery and channel scheduling](./issues/03-durable-delivery-and-channel-scheduling.md)
- [04 — Continuous scan coverage and checkpoints](./issues/04-scan-coverage-and-checkpoints.md)
- [05 — Semantic admission and silent feedback](./issues/05-semantic-admission-and-silent-feedback.md)
- [06 — Atomic review and Action Item disposition](./issues/06-atomic-review-and-action-items.md)
- [07 — Web review and failure recovery](./issues/07-web-review-and-failure-recovery.md)
- [08 — Regression verification and API contracts](./issues/08-regression-verification-and-api-contracts.md)

## Fog

- No open product-policy branches remain from the interview. Complete implementation scope, configurable defaults and regression criteria are recorded in [spec.md](./spec.md), with eight separate task tickets.
- User invoked implement-spec after the completed design interview; implementation is authorized and tickets begin ready-for-agent. This effort does not include deployment or modifying live database files.

## Implementation

- Integration branch: `codex/project-reliability-repair`.
- Approved test seams: persistent repository/review APIs, production discussion analysis API with injected AI, Bot delivery/harvesting public interfaces, and Web review/recovery HTTP behavior, as specified in spec.md.
