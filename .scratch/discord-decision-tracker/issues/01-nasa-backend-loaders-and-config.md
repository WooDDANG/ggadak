# 01 — Prisma ORM Integration (Schema, Client & Type-Safe Repository)

**What to build:**
Adopt Prisma ORM with SQLite, defining declarative database models (`Decision`, `ExternalFeedback`, `ChannelCheckpoint`, `RejectedEvidenceHash`) in `prisma/schema.prisma`. Replace manual SQL query strings and positional `?` placeholder bindings with type-safe Prisma client operations.

**Blocked by:**
None — can start immediately.

**Status:** ready-for-agent

- [ ] `prisma/schema.prisma` defined with models and SQLite datasource (`DATABASE_URL`).
- [ ] NPM scripts `db:generate` (`prisma generate`) and `db:push` (`prisma db push`) configured.
- [ ] `DecisionRepository` refactored to use `PrismaClient` for all CRUD, search queries, checkpoints, external feedback, and rejected evidence memory.
- [ ] Database loader `loaders/prisma.ts` initializing the client connection.
