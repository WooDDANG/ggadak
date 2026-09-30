# 05 — Full Monorepo E2E & Smoke Verification

**What to build:**
Verify the complete end-to-end integration flow across all modules (Shared, TSOA/Prisma/TypeDI BE, Bot, Web Dashboard) with 100% automated test coverage, Swagger verification, and zero regressions.

**Blocked by:**
04 — Bot & Web Dashboard Alignment with TSOA Endpoints

**Status:** ready-for-agent

- [ ] All shared schema tests pass (`npm run test --workspace=@ggaddak/shared`).
- [ ] All backend TSOA integration tests pass (`npm run test --workspace=@ggaddak/be`).
- [ ] All bot core module tests pass (`npm run test --workspace=@ggaddak/bot`).
- [ ] End-to-end integration harness passes (`node --test dist-test/e2e.test.js`).
- [ ] Full monorepo lint and formatting check cleanly passes (`npm run lint && npm run format:check`).
