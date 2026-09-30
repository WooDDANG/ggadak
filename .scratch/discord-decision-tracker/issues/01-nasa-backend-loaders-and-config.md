# 01 — NASA-Style Backend Foundation (Loaders, Config, DTOs, Models & Errors)

**What to build:**
Establish a clean, modular server lifecycle, domain modeling, and environment configuration inspired by NASA_backEnd. Implements a central `config/` module, a modular `loaders/` bootstrap layer (Express, Database, Logger), explicit `dto/` (Request/Response DTOs), `models/` (DB Entity models & schemas), `mappers/` (Entity-DTO transformation), and a centralized `AppError` and `errorHandler` middleware.

**Blocked by:**
None — can start immediately.

**Status:** ready-for-agent

- [ ] Central application configuration loaded in `config/index.ts` from environment variables and defaults.
- [ ] Explicit `dto/` definitions (`decision.dto.ts`, `discussion.dto.ts`, `feedback.dto.ts`, `checkpoint.dto.ts`, `policy.dto.ts`).
- [ ] Explicit `models/` database entity models (`decision.entity.ts`, `feedback.entity.ts`, `checkpoint.entity.ts`, `rejected-evidence.entity.ts`).
- [ ] `mappers/` for bidirectional conversion between DB Rows, Domain Entities, and API DTOs.
- [ ] `loaders/logger.ts` for unified Winston/Morgan structured logging.
- [ ] `loaders/database.ts` for SQLite database initialization and automatic table migrations.
- [ ] `loaders/express.ts` configuring CORS, Helmet, JSON body parsing, and route mounts.
- [ ] `loaders/index.ts` providing an async loader orchestrator.
- [ ] Custom `AppError` hierarchy and global Express `errorHandler` middleware responding with structured error payloads.
