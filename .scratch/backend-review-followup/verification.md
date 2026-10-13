# Verification

## Scope

Review 정책 Service 이관, 공통 분석 입력·결과 계약, Sync Job 재시작 집계 및 임대·서버 잠금 복구를 구현했다. FE 파일과 운영 DB는 변경하지 않았다.

## Checks

- `npm test`: build 포함 전체 142개 통과 — Shared 15, BE 78, Bot 33, FE 10, E2E 6.
- `npm run typecheck`: 통과.
- `npm run lint`: 오류 없음. 기존 `packages/shared/src/logger.test.ts`의 unused `beforeEach` warning 1개 유지.
- 변경된 소스·설정의 Prettier check 및 `git diff --check`: 통과.
- 로컬 HTTP 테스트는 샌드박스 `listen EPERM` 확인 후 승인된 sandbox 외부 실행으로 검증했다. 인증 fixture가 Repository의 암묵적 파싱에 의존하던 부분은 명시적 도메인 정규화로 수정했다.

## Behavioral evidence

- DecisionService: concurrent replacement에서 한 successor만 승인; stale candidate/predecessor, 잘못된 Action Item disposition 및 DB 실패 시 rollback; Independent Retention, transfer provenance, completed history, 승인 정보 재시작 보존; rejected evidence 저장 실패의 rollback.
- DiscussionService: request replay·동시 요청·changed payload conflict; 원본 메시지 ID 및 reply 보존; reviewer edits 보존·manual reanalysis·rejected evidence scope 유지.
- SyncJobService: 결과 재보고 집계 멱등성, 2개 채널 중 1개 완료 후 재획득, 실패 채널의 성공 복구, claim 경합, 미완료 terminal 차단, 다른 guild 독립 실행.
- SyncJobWorker + 실제 SQLite Service: 재시작 시 미완료 채널만 스캔; 150초 스캔 중 heartbeat·중복 요청 409; 임대 상실 후 추가 채널 처리 중단 및 timer cleanup.
- 마이그레이션 fixture: 기존 Decision 및 완료 Sync Job 데이터를 보존.
- HTTP 계약: service 인증을 유지한 owner/channel result 갱신 및 guild-scoped 공개 조회.

## Delivery

새 additive migrations: `202610130001_sync_channel_results`, `202610130002_sync_owner`. 운영 DB 적용과 배포는 수행하지 않았다. BE와 Bot은 함께 업데이트해야 한다. 내부 Sync Job 쓰기는 claim owner와 채널별 결과를 요구하며 공개 응답 계약은 유지한다. 기존 active Job은 다음 복구 실행에서 채널별 집계를 재구축하고 기존 terminal Job의 집계는 보존한다.
