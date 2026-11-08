# 서버 권한 재확인 정책 인터뷰

## 확정

- Q1 예: Portal·Bot 멤버 이벤트를 정상 운영 기준으로 하고 설정 누락·관측 신뢰 상실을 명시한다.
- Q2 예: 요청 제한 시 로그인·초안을 유지하며 확인되지 않은 데이터 접근을 차단한다. Discord 대기 시간을 준수하고 대기 종료만으로 자동 폴링하지 않는다.
- Q3 예: 설치 서버의 기존 가입 증명과 이벤트 연속성으로 선택 목록을 판단한다. 미설치 membership만으로 전체 목록 재검증을 유발하지 않는다.
- Q4 예: 같은 사용자의 탭·세션에 제한 대기를 공유하고 사용자별 제한과 Discord가 명시한 전체 제한의 적용 범위를 구분한다.
- Q5 예: 관측 불가 시에도 실제 요청의 새 Discord 가입·권한 검증 성공으로 접근을 허용한다. 과거 권한의 고정 시간 무조건 재사용은 하지 않는다.
- Q6 예: 로그인 계정명·상태를 계속 표시하고 서버 데이터와 초안 제출만 보류한다. 권한 확인 대기·남은 시간을 명시한다.
- Q7 예: 제한 적용 범위와 대기 종료 시각을 BE 재시작 후에도 보존한다. 재로그인·자격증명 회전으로 대기를 우회하지 않는다.
- Q8 예: 유효한 Discord 대기 값을 우선하고, 429에 값이 없거나 해석 불가일 때만 기본 30초를 적용한다. 대기 종료만으로 자동 요청하지 않는다.
- 결정: [ADR-0026](../../docs/adr/0026-event-coverage-and-rate-limited-guild-verification.md).

## 확인된 사실

- 관측 coverage는 연결·lease·membersIntent·설치/available을 모두 요구한다. membersIntent가 없으면 순차 데이터 요청이 반복 OAuth 재검증을 유발한다.
- 현재 공유는 진행 중 Promise에만 적용되며, 완료 직후 순차 요청은 다시 토큰 갱신과 전체 가입 목록 조회를 시작한다.
- 목록 신뢰는 모든 저장 membership을 대상으로 판정하므로 봇 미설치 membership 하나만 있어도 전체 목록 재검증을 유발할 수 있다.
- 외부 429의 Retry-After/retry_after 정보가 현재 일반 502 변환 중 소실된다.
- refresh credential은 가입 조회보다 먼저 회전을 저장한다. 이 순서를 보존해야 한다.

## 인터뷰 및 구현 상태

- Q1–Q8 합의 완료. 티켓 01, 02, 03, 04 구현 및 FE/BE 전체 테스트, 브라우저 회귀, 루트 E2E 테스트 통과 완료.

## Orchestration

- Parent baseline 00e98a5 / FE0b1239a; new branch fix/guild-verification-policy in both repositories.
- Preserve staged user docs/ai-operation-logic.md and docs/integration-test-feedback.md. Commit only owned paths.
- BE/Bot worker owns apps/be source/tests/prisma and Bot coverage/config plus auth/operations docs. FE worker owns frontend source/tests/README. Root owns generated contracts, root E2E, coordination, integration, review, commits and PRs.
- Existing Herdr agy is occupied with another task. Assigned workers use explicit non-overlapping ownership. All checks are root-scheduled in ggaddak verify w1:p2, serially.
- Approved seams: actual App/UI, actual BE HTTP with isolated DB and controlled external Discord observations/transport. TDD RED/GREEN per slice.
- Additive contract: guildVerification contains status ready/unavailable/rate_limited, retryAt ISO/null, eventCoverage trusted/members_intent_disabled/disconnected/expired/unknown. Existing guildSelection remains compatible. Verification errors expose safe retry metadata and Retry-After.
- Valid browser session restoration preserves identity/JWT when only guild verification is temporarily unavailable. Authentication invalidity still returns401.
- 01/02 running in distinct producer/consumer scopes;03 completes after producer/consumer contract verification;04 foundation running, final acceptance depends01–03.

인터뷰 단계다. 제품 코드·실제 Portal·환경 설정은 변경하지 않는다. 기존 사용자 문서의 스테이징은 보존한다.
