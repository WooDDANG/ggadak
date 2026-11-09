# 01: Container build and volume setup

**What to build:** A self-contained, reproducible container build for the monorepo backend that pre-builds `@ggaddak/shared`, compiles `@ggaddak/be`, ensures Python 3 is available for storage scripts, and boots cleanly with SQLite stored in a dedicated persistent directory (`/data`), verifying `/health` succeeds upon startup.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Multi-stage Dockerfile builds successfully from the repository root using Node 22-slim and Python 3.
- [ ] `@ggaddak/shared` builds and links properly with `@ggaddak/be` inside the container.
- [ ] Prisma client generation and TSOA swagger generation execute cleanly during container build.
- [ ] Entrypoint script/command runs `prisma migrate deploy` against the target database path before starting Express server.
- [ ] Container starts with `DATABASE_URL="file:/data/decisions.sqlite"` and returns `{ "status": "healthy" }` from `GET /health`.
