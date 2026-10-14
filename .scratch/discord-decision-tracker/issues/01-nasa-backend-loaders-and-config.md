# 01 — Prisma ORM Integration (Schema, Client & Type-Safe Repository)

**What to build:**
Adopt Prisma ORM with SQLite, defining declarative database models (`Decision`, `ExternalFeedback`, `ChannelCheckpoint`, `RejectedEvidenceHash`) in `prisma/schema.prisma`. Replace manual SQL query strings and positional `?` placeholder bindings with type-safe Prisma client operations.

**Blocked by:**
None — can start immediately.

**Status:** resolved

- [ ] `prisma/schema.prisma` defined with models and SQLite datasource (`DATABASE_URL`).
- [ ] NPM scripts `db:generate` (`prisma generate`) and `db:push` (`prisma db push`) configured.
- [ ] `DecisionRepository` refactored to use `PrismaClient` for all CRUD, search queries, checkpoints, external feedback, and rejected evidence memory.
- [ ] Database loader `loaders/prisma.ts` initializing the client connection.

## Comments

2026-10-14: Prisma schema/repository/loader 구현 확인. db:push 대신 additive migration용 db:migrate를 사용한다. [대조 기록](../../ticket-audit-2026-10-14.md).
