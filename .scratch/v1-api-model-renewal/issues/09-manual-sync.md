# 09: 수동 Discord 동기화

**What to build:** 화면에서 동기화를 시작하면 모니터링 채널을 수집·분석하고 후보를 Review Queue에서 확인한다.

**Blocked by:** 03: AI 공급자 설정과 실패·재시도 처리 정상화, 05: Discord 채널 모니터링 설정, 07: Review Queue 검수 흐름 전환

**Status:** ready-for-agent

- [ ] POST 동기화 요청은 저장된 jobId와 202 응답을 반환하고 화면에서 실제 작업 진행·완료·실패를 확인한다.
- [ ] Sync Job의 모델·마이그레이션·ERD를 갱신하고 작업 상태 조회 계약을 정의한다.
- [ ] 중복 동기화는 409로 처리하고 forceFullSync의 범위·재분석 정책을 명시한다.
- [ ] 봇의 Analysis Request 재시도·중복 방지 및 Scan Range 완료 기준의 Channel Checkpoint를 유지한다.
- [ ] 동기화 중 재시작·AI 실패 후 복구와 중복 후보 방지, 검수 큐까지의 연결을 검증한다.

