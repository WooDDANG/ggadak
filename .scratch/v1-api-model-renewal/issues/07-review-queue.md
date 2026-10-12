# 07: Review Queue 검수 흐름 전환

**What to build:** 봇이 추출한 Decision Candidate를 검수 화면에서 확인하고 확정·보류·폐기하거나 기존 결정을 교체한다.

**Blocked by:** 06: 결정 모델 이전과 목록·상세 조회

**Status:** resolved

- [x] Review Queue 목록과 상태 변경 API를 DB·생성 클라이언트·검수 화면까지 연결하고 ticketId와 decisionId의 동일 엔티티 식별 정책을 명시한다.
- [x] 확정 날짜와 검수자를 저장하고 확정·보류·폐기 후 목록 및 상세에 반영한다.
- [x] 오래된 버전의 검수와 이미 처리된 후보를 거부하고 서버 접근 권한을 검증한다.
- [x] 교체는 predecessor와 successor 상태를 원자적으로 갱신하고 미완료 Action Item의 취소·이전 및 완료 이력을 보존한다.
- [x] Evidence Hash의 폐기 후보 재생성 억제와 수동 재분석 예외를 유지하고 검수 전환을 검증한다.


## Answer

Review Queue는 `GET /api/v1/review-queue`와 `POST /api/v1/review-queue/{ticketId}/review`로 전환했다. ticketId는 Decision의 기존 문자열 id와 동일하며 별도 티켓/결정을 만들지 않는다. 서버 회원 인증과 guildId 격리, 세션 기반 검수자 기록, 후보/선행 결정 버전 검증을 적용했다. 기본 대기 목록과 보류 목록을 제공하며 확정·보류·폐기 결과는 결정 목록/상세의 lifecycle 및 날짜와 일치한다.

FE는 생성된 Orval 호출로 대기/보류 후보를 조회하고 독립 확정 또는 기존 확정 결정 교체를 선택한다. 교체 시 미확인 Action Item의 완료 여부를 분류하고 미완료 항목마다 취소/이전을 선택한다. 완료 이력과 이전 출처를 보존하는 기존 원자적 저장소 전환을 사용한다. 실패 시 오류를 표시하고 해당 서버 목록/상세를 다시 조회한다. Evidence Hash 폐기 억제와 수동 재분석의 기존 후보 상태 보존 예외는 유지했다.

검증: BE/FE 빌드와 API 재생성 통과. Review Queue HTTP + 공개 저장소 lifecycle/재시작/동시 교체/롤백 + DiscussionService 폐기 재생성 억제/수동 재분석 회귀 22개 통과. FE 생성 클라이언트/검수 화면 포함 5개 테스트 통과. 모든 DB 검증은 임시 SQLite에서 수행했으며 운영 DB는 변경하지 않았다.
