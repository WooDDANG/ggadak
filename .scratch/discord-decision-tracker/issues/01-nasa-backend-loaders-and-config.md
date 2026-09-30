# 01 — NASA-Style Backend Foundation (Loaders, Config & Error Handling)

**What to build:**
Establish a clean, modular server lifecycle and environment configuration inspired by NASA_backEnd. Implements a central `config/` module, a modular `loaders/` bootstrap layer (Express, Database, Logger), and a centralized `AppError` and `errorHandler` middleware.

**Blocked by:**
None — can start immediately.

**Status:** ready-for-agent

- [ ] Central application configuration loaded in `config/index.ts` from environment variables and defaults.
- [ ] `loaders/logger.ts` for unified Winston/Morgan structured logging.
- [ ] `loaders/database.ts` for SQLite database initialization and automatic table migrations.
- [ ] `loaders/express.ts` configuring CORS, Helmet, JSON body parsing, and route mounts.
- [ ] `loaders/index.ts` providing an async loader orchestrator.
- [ ] Custom `AppError` hierarchy and global Express `errorHandler` middleware responding with structured error payloads.
