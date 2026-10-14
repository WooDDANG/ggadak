# 05 — Full Monorepo E2E & Smoke Verification

**What to build:**
Verify the complete end-to-end integration flow across all modules (Shared, TSOA/Prisma/TypeDI BE, Bot, Web Dashboard) with 100% automated test coverage, Swagger verification, and zero regressions.

**Blocked by:**
04 — Bot & Web Dashboard Alignment with TSOA Endpoints

**Status:** needs-triage

- [ ] All shared schema tests pass (`npm run test --workspace=@ggaddak/shared`).
- [ ] All backend TSOA integration tests pass (`npm run test --workspace=@ggaddak/be`).
- [ ] All bot core module tests pass (`npm run test --workspace=@ggaddak/bot`).
- [ ] End-to-end integration harness passes (`node --test dist-test/e2e.test.js`).
- [ ] Full monorepo lint and formatting check cleanly passes (`npm run lint && npm run format:check`).

## Comments

2026-10-14: 후속 전체 테스트 통과 기록은 있으나 format:check가 3개 파일에서 실패한다. 현재 harness는 Vitest이며 100% coverage 달성은 확인되지 않았다. 최신 검증 범위로 재명세 필요. 포맷 수정은 이번 범위에서 제외한다.
