# 01 — NASA-Style Backend Foundation, Security (Helmet/Rate-Limit) & Structured Logging (Winston)

**What to build:**
Establish a hardened, modular backend foundation inspired by NASA_backEnd. Implements a central `config/` module, a modular `loaders/` bootstrap layer (Express, Database, Logger), HTTP security headers with `helmet`, API abuse and LLM cost protection via `express-rate-limit`, structured logging with `winston`, and centralized `AppError` and `errorHandler` middleware.

**Blocked by:**
None — can start immediately.

**Status:** ready-for-agent

- [ ] Central application configuration loaded in `config/index.ts` from environment variables and defaults.
- [ ] `loaders/logger.ts` integrating Winston with daily rotating logs and contextual metadata.
- [ ] `loaders/database.ts` for SQLite database initialization and automatic schema migrations.
- [ ] `loaders/express.ts` configuring `helmet`, `express-rate-limit`, CORS, and JSON parsing.
- [ ] `loaders/index.ts` providing an async loader orchestrator.
- [ ] Custom `AppError` hierarchy and global Express `errorHandler` middleware responding with standardized error payloads.
