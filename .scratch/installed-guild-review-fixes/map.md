# 설치된 가입 서버 선택: 리뷰 후속 개선

## 배경과 범위

- 사용자 요청: 최신 커밋 리뷰에서 발견한 문제를 개선할 수 있도록 티켓화한다.
- 리뷰 기준: 부모 저장소 `c3882a2...4e780eb`, 연결된 FE PR 변경 `4a77091...e45aa8b`.
- 앞서 제시한 4개 분할을 사용자가 to-tickets로 다시 요청하여 로컬 트래커에 등록했고, 이어 implement로 구현을 승인했다.
- 기존 [설치된 가입 서버 선택 명세](../installed-guild-selection/spec.md)와 기존 티켓은 수정하거나 닫지 않는다.
- 실제 화면 회귀 재현 자료: [Chrome 재현 스크립트](../../.data/latest-review/repro.mjs). 로컬 ignored 진단 자료이며 커밋되는 테스트를 대신하지 않는다.

## 티켓과 선행 관계

| 번호 | 티켓 | 리뷰 분류 | 선행 | 실행 상태 |
| --- | --- | --- | --- | --- |
| 01 | [편집 초안 보존](issues/01-preserve-edit-drafts.md) | Spec P1 | 없음 | done |
| 02 | [인증 취소 후 복귀](issues/02-recover-canceled-oauth.md) | Spec P2 | 없음 | done |
| 03 | [JWT 갱신 정책 통합](issues/03-unify-token-renewal.md) | Standards P3 | 없음 | done |
| 04 | [실제 FE→BE 연동 검증](issues/04-verify-real-frontend-backend.md) | Spec P2 | 01·02·03 | done |

## Orchestration

- Baseline: parent 4e780eb, frontend e45aa8b. Current parent branch fix/frontend-review-followups; frontend fix/auth-review-followups. User requested new branches and new PRs for this follow-up; preserve the original FE PR3 at e45aa8b. Preserve pending ticket files.
- Live Herdr discovery found no available repository worker/agy. Codex frontend worker owns frontend source, browser regressions and frontend README for tickets01–03, sequentially to avoid shared-auth-file conflicts. Root owns actual BE integration tests/support, parent docs, lockfiles and coordination records for04, final review, commits, PR and gitlink.
- Only root schedules checks in ggaddak verify pane w1:p2; each RED/GREEN/build/typecheck runs serially there. Existing dev services stay in their panes.
- Test seams were approved in these tickets: actual App/UI interactions and real frontend-to-backend HTTP, with controlled external Discord observations. No new testing seam approval is needed.
- Tickets01–04 done. Changes and final verification completed; coordinating agent owns final commits, PR update and parent gitlink.

## 진행 원칙

- 시작 가능한 frontier는 01·02·03이다. 공통 인증 코드를 수정하므로 구현 시 파일 소유권과 검증 pane을 조율한다. 파일 충돌 가능성은 제품 선행 의존성으로 추가하지 않는다.
- 각 수정 티켓은 자체 브라우저 또는 HTTP 회귀로 독립 검증한다. 04의 테스트 기반 준비는 병행할 수 있지만 최종 통합 통과는 수정 완료 후 확인한다.
- FE는 작업 브랜치와 한글 PR로 제출한다. 기본 브랜치 직접 push·자동 merge는 하지 않으며 부모 submodule은 검증한 커밋만 기록한다.
- 빌드·코드 생성·테스트·타입 검사는 Herdr verify의 Tests · Build pane에서 직렬 실행한다.

## 완료 및 검증

- FE 커밋: `18e5b43` — 동일 계정·서버 초안 보존, 확인 불가 숨김/inert 및 요청 차단, 인증 취소 복귀, 인증 범위별 공통 JWT 갱신.
- 실제 FE→BE Chrome 시나리오 4개 실행·통과. 토큰 전송 시점만 제어하고 실제 BE 인증·응답·쿠키·데이터 인가를 통과했다.
- `npm run typecheck`와 최종 `npm test` 통과: BE 184개, Bot 53개, FE 12개, 전체 E2E 13개. 모든 빌드는 Herdr verify pane에서 실행했다.
- 첫 전체 검증에서 FE 테스트 파일 병렬 실행의 공유 Vite 캐시 충돌을 확인했다. 파일 직렬 실행으로 보완한 뒤 전체 검증이 통과했다.
- Standards: 미해결 0개. Spec: 실제 BE JWT 경합 검증 공백 1개를 보완하고 재검토 후 미해결 0개.
- 부모 저장소는 검증한 FE 커밋을 기록한다. 리뷰 보완은 새 FE PR로 제출하며 기본 브랜치 push·자동 merge는 하지 않는다.

## 제출

- FE: fix/auth-review-followups / 18e5b43 / https://github.com/likelion-kkadak/frontend/pull/4
- 기존 FE PR3은 e45aa8b에 유지한다. 새 PR4는 미병합 기반 변경을 포함함을 본문에 명시했다.
- 부모: fix/frontend-review-followups에서 기존 feat/installed-guild-selection을 기준으로 별도 PR을 제출한다.
