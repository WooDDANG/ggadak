# 이벤트 기반 서버 접근 권한 보완

- Spec: [spec.md](spec.md)
- 01: [기존 External Feedback API 인증 적용](issues/01-feedback-service-auth.md)
- 02: [사용자 탈퇴 이벤트로 서버 접근 즉시 차단](issues/02-membership-event-revocation.md)
- 03: [권한 변경·Bot 탈퇴·연결 복구를 서버별 상태에 반영](issues/03-permission-and-connection-events.md)
- 04: [고정 주기 권한 재조회를 제거하고 JWT 갱신과 분리](issues/04-demand-driven-auth-revalidation.md)
- Baseline commit: `c20f9b2315436bfb8de82f2a415268307bf812c9`

## Decisions

- 2026-11-03: 사용자 요청으로 구현을 진행하기 전에 티켓을 재작성했다. 15분 권한 캐시 고정 검증을 이벤트 기반 무효화와 필요한 시점의 재검증으로 대체한다.
- 피드백 API 인증 보완은 유지한다. 서버별 웹 피드백과 웹 실시간 푸시 신규 기능은 범위에서 제외한다.
- 각 티켓에 실제 동작 검증과 문서 갱신을 포함한다. 보안 회귀 검증을 마지막 별도 작업으로 미루지 않는다.
- Dependencies: 01 independent; 02 → 03 → 04. 네 티켓 구현과 전체 검증을 완료했고 통합 리뷰 중이다.
- Portal의 GUILD_MEMBERS 설정은 외부 전제조건이다. 미설정 환경은 이벤트 미지원으로 다루고 요청 시 재검증한다.

## Orchestration

- Coordinator: Codex. 사용자의 implement 호출로 구현 진행. 기준 HEAD는 위 Baseline commit이며 기존 사용자 변경을 보존한다.
- Ticket 01: review. Feedback 인증, Bot 피드백 호출, 회귀 테스트와 생성 계약/인증 문서.
- Ticket 02: review. 멤버십 이벤트 전달과 무효화, 관련 저장 상태/계약, Bot 및 HTTP 회귀 테스트.
- Ticket 03: review. 역할/설치/연결 이벤트와 복구, 관련 Bot 및 HTTP 회귀 테스트.
- Ticket 04: review. BE 세션/권한 재검증 분리, FE 복원/오류 복구, 해당 HTTP 및 FE 회귀 테스트, 정책/운영 문서.
- Coordination records: Codex exclusively owns this effort's spec, map, tickets. 구현 배정 시 공유 계약·migration·생성 산출물과 겹치는 파일은 한 번에 한 담당자만 편집한다.
- Verification: Herdr session `ggaddak`, `verify` tab, pane `w1:p2`; Codex serializes all checks. Existing environment points to another session; all GGADDAK controls use explicit session IDs.
- Baseline user changes preserved: README, API documents, fe-api-completeness map and documentation ticket, AI architecture document. These files are excluded from implementation edits and commit.
- Review: 구현 시 Standards와 Spec 리뷰 및 관련 검증을 거친 뒤 완료 처리한다.

### Implementation assignments

- Root Codex: BE event service/controller, AuthService, DB schema/migrations, Shared event contract, loaders, BE auth/isolation tests, generated files, auth/session documentation and coordination records.
- feedback worker: Ticket 01; Feedback controller, Bot backend-api.service.ts, relevant feedback-only tests. No generated files or documentation edits. Checks scheduled by root.
- bot-events worker: Tickets 02/03 producer; new Bot guild-access publisher/events/tests, Bot client/config wiring. No backend-api.service.ts edits. Checks scheduled by root.
- frontend worker: Ticket 04 FE only; AuthGate, browser-session/session/transport and relevant FE tests. No generated files. Checks scheduled by root.
- Shared checks: coordinator exclusively owns Herdr verify pane w1:p2; workers do not run checks in other terminals.

## Verification

- Herdr verify pane에서 `npm run lint && npm run typecheck && npm test` 성공. 전체 build와 workspace 테스트, E2E가 포함됐다.
- 별도로 실제 Bot event publisher→BE HTTP→기존 JWT 접근 거절 통합 테스트가 통과했다.
- 초기 실패 확인: 미인증 Feedback 200/401, FE idle 주기 조회, token-only helper 부재, permission recovery 부재, reset ACK 유실에 따른 변경 누락, 일반 검색 장애의 불필요한 권한 복구.
- Discord Portal과 운영 DB는 변경하지 않았다. Intent 활성화 및 백업한 선택 DB에 신규 migration 적용은 배포 시 필요하다.
