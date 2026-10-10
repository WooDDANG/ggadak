# 01 — Database Authority and Migration

Type: task
Status: resolved

## Scope

Implement the database authority and migration section of [spec.md](../spec.md), following ADR-0018. Start with `apps/be/prisma/schema.prisma`, `src/repositories/decision.repository.ts`, loaders, startup, and shared domain contracts. Replace memory-only production reads and unawaited writes; preserve the complete current Decision model and add review versions and Action Item identity/state/provenance.

## Acceptance

- [x] Full Decision, feedback, rejected evidence and checkpoint fields survive service restart using an isolated SQLite database.
- [x] Reviewer changes and original timestamps persist; DB failures surface as failures instead of successful memory writes.
- [x] Application initialization completes before listening; unavailable DB prevents normal readiness.
- [x] Checked-in migrations and explicit generation/migration commands work on legacy-schema fixture copies.
- [x] Both legacy SQLite locations are inspected read-only; configured active path is explicit. Conflicting data is reported, not silently merged. Live files are not changed by this ticket.
- [x] Missing historical values stay missing; legacy Action Item completion is not fabricated.

## Comments

Implementation authorized by the user invoking implement-spec. Depends on no other ticket. Add restart, failed-write and migration tests as part of this change.

## Answer

Database authority is implemented: all repository calls are asynchronous Prisma operations, API/service calls await them, and server factories await database connection/table readiness before returning. Startup fails on unavailable/unmigrated databases. Save normalizes shared defaults; domain JSON preserves all fields alongside legacy indexed columns; creation timestamps remain original. Review versions and stable Action Item identity, unknown completion and transfer provenance are persisted. Ordinary ingestion no longer supersedes predecessors.

Validation: shared/BE build and root E2E TypeScript compile pass; 4 isolated repository/migration tests pass (full restart equality, feedback/rejection/checkpoint recovery, reviewer persistence, failed writes/startup, additive legacy migration). Read-only export/import of the 7-row old database into an isolated migrated target succeeds, repeated import rejects collisions before mutation. Integration coordinator ran escalated isolated HTTP tests: 8/8 pass, including raw webhook normalization, awaited ingestion and review persistence.

Read-only inspection: configured `apps/be/.env` DATABASE_URL is `file:./decisions.sqlite`, resolved by Prisma to `apps/be/prisma/decisions.sqlite`: 305 decisions, 5 checkpoints. Older `apps/be/decisions.sqlite`: 7 decisions, 5 checkpoints. No Decision ID overlap; all 5 common checkpoint boundaries differ. Live databases were never changed. Migration baseline/additive SQL, explicit commands, safe backup/export/import and conflict handling are documented in [Prisma migration guide](../../../apps/be/prisma/README.md). Missing history remains absent; migrated legacy tasks explicitly remain unknown.

Contract for dependents: `DecisionRepository(prisma: PrismaClient)` exposes `prisma`, `decodeDecision(row)` and `decisionData(decision)` for atomic transactional policies. All public repository methods return Promises. `createApp/createServer` return Promises. Generate with `npm run db:generate --workspace=@ggaddak/be`, migrate isolated DBs with absolute DATABASE_URL and `npm run db:migrate --workspace=@ggaddak/be`. AnalysisRequest schema/transactions belong to ticket 02.
