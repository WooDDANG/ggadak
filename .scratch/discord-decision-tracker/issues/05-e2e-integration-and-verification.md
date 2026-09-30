# 05 — End-to-End Integration Verification & Smoke Testing

**What to build:**
Verify the complete end-to-end integration flow across all modules (Shared, Backend Express MVC, Discord Bot Layered Event Architecture, Web Dashboard Review Queue) with 100% automated test coverage and zero regressions.

**Blocked by:**
04 — Bot Layered Handlers, Services & Views Alignment

**Status:** ready-for-agent

- [ ] All shared schema tests pass (`npm run test --workspace=@ggaddak/shared`).
- [ ] All backend Express tests pass (`npm run test --workspace=@ggaddak/be`).
- [ ] All bot core module tests pass (`npm run test --workspace=@ggaddak/bot`).
- [ ] End-to-end integration harness passes (`node --test dist-test/e2e.test.js`).
- [ ] Full monorepo lint and formatting check cleanly passes (`npm run lint && npm run format:check`).
