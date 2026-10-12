# 13: 기존 API·클라이언트 전환 완료 및 제거

**What to build:** 모든 화면과 봇이 지원되는 계약을 사용하며 이전 검수 경로와 중복 API를 제거한 상태로 전체 흐름이 동작한다.

**Blocked by:** 08: 결정 카드 편집, 10: 대시보드 요약, 11: Why 자연어 검색, 12: Decision Timeline

**Status:** resolved

- [x] 프론트·봇·테스트의 실제 호출자를 조사해 기존 API 호출을 전환하고 등록된 Discord 충돌 버튼 검수 경로를 웹 중심 검수 흐름으로 정리한다.
- [x] 기존 conflict·결정 webhook 등 제거 대상은 동등한 지원 경로와 호출자 전환을 검증한 뒤 제거한다. 분석·정책·체크포인트·후보 이력 등 필요한 내부 API는 유지하고 인증 경계를 검증한다.
- [x] 기존 컬럼·domainJson·상태 별칭 등 임시 호환 구조는 이전 데이터와 모든 호출자의 전환이 확인된 항목만 제거한다.
- [x] 최종 ERD·Prisma 모델·OpenAPI·생성 클라이언트를 일치시키고 로그인부터 설정·동기화·검수·편집·검색·타임라인까지 회귀 검증한다.
- [x] 운영 DB 변경은 검증된 마이그레이션과 백업·복구 절차를 준비하고 별도 승인 범위에 따라 수행한다.

## Answer

Removed the duplicate unauthenticated `/api/decisions` listing and review routes, the legacy conflict route, and `/api/webhooks/decisions`. Bot analysis continues through `/api/discussions/analyze`, which persists candidates; the bot no longer registers Discord conflict buttons. FE and the end-to-end flow use the authenticated v1 Review Queue and Decision read APIs. Candidate history, analysis, policy, checkpoint, feedback, sync, and authentication routes remain.

Regenerated TSOA routes, OpenAPI, and Orval output. Removed stale generated conflict/webhook DTO artifacts. No Prisma or ERD schema change was needed: `Decision.domainJson` remains authoritative and the repository still reads legacy rows without it, while projection columns remain used by current queries and migrations. No operational database was changed.

Validation: `npm run db:generate --workspace=@ggaddak/be`, `npm run api:sync`, and full `npm test` passed, including BE/Bot/FE builds and both end-to-end flows. The E2E review test logs in and exercises authenticated guild-scoped review and confirmed-decision reads. Runtime Discord and AI calls remain adapter-backed in tests.

## Comments

Implement-spec review follow-up: added the shared `BOT_SERVICE_TOKEN` boundary to the retained discussion analysis and candidate-history routes. HTTP coverage verifies requests without a token fail and Bot-token requests succeed for both routes; FE decision response handling now uses one shared envelope helper.

Verification criterion: unauthenticated `POST /api/discussions/analyze` and `GET /api/discussions/history/{decisionId}` requests are rejected; requests carrying the configured service bearer token are accepted for both routes.

