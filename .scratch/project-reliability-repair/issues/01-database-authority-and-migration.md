# 01 — Database Authority and Migration

Type: task
Status: ready-for-agent

## Scope

Implement the database authority and migration section of [spec.md](../spec.md), following ADR-0018. Start with `apps/be/prisma/schema.prisma`, `src/repositories/decision.repository.ts`, loaders, startup, and shared domain contracts. Replace memory-only production reads and unawaited writes; preserve the complete current Decision model and add review versions and Action Item identity/state/provenance.

## Acceptance

- [ ] Full Decision, feedback, rejected evidence and checkpoint fields survive service restart using an isolated SQLite database.
- [ ] Reviewer changes and original timestamps persist; DB failures surface as failures instead of successful memory writes.
- [ ] Application initialization completes before listening; unavailable DB prevents normal readiness.
- [ ] Checked-in migrations and explicit generation/migration commands work on legacy-schema fixture copies.
- [ ] Both legacy SQLite locations are inspected read-only; configured active path is explicit. Conflicting data is reported, not silently merged. Live files are not changed by this ticket.
- [ ] Missing historical values stay missing; legacy Action Item completion is not fabricated.

## Comments

Implementation authorized by the user invoking implement-spec. Depends on no other ticket. Add restart, failed-write and migration tests as part of this change.
