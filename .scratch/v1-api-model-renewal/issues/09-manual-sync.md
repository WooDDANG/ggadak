# 09: 수동 Discord 동기화

**What to build:** 화면에서 동기화를 시작하면 모니터링 채널을 수집·분석하고 후보를 Review Queue에서 확인한다.

**Blocked by:** 03: AI 공급자 설정과 실패·재시도 처리 정상화, 05: Discord 채널 모니터링 설정, 07: Review Queue 검수 흐름 전환

**Status:** resolved

- [ ] POST 동기화 요청은 저장된 jobId와 202 응답을 반환하고 화면에서 실제 작업 진행·완료·실패를 확인한다.
- [ ] Sync Job의 모델·마이그레이션·ERD를 갱신하고 작업 상태 조회 계약을 정의한다.
- [ ] 중복 동기화는 409로 처리하고 forceFullSync의 범위·재분석 정책을 명시한다.
- [ ] 봇의 Analysis Request 재시도·중복 방지 및 Scan Range 완료 기준의 Channel Checkpoint를 유지한다.
- [ ] 동기화 중 재시작·AI 실패 후 복구와 중복 후보 방지, 검수 큐까지의 연결을 검증한다.

## Answer

`POST /api/v1/sync-jobs?guildId=...` snapshots the monitored channels, persists a queued Sync Job, and returns HTTP 202 with `jobId`; a per-guild lock returns 409 while a queued or leased job is active. `GET /api/v1/sync-jobs/{jobId}?guildId=...` returns status and channel/message/candidate progress after guild authorization. The generated Orval contract and Manual Sync screen show queued, processing, completed, and failed outcomes. Force Full Sync ignores the Channel Checkpoint, scans all stored history, and creates a job-scoped Analysis Request ID so retries reuse the result while a later forced job is intentional reanalysis.

The Bot claims jobs through service-token-only internal endpoints, scans the snapshotted channels serially, reports progress under a renewable lease, and retries an expired processing job after restart. It only writes the Channel Checkpoint after the backend acknowledges a completed Analysis Request, including a completed no-candidate result. Normal request IDs remain content-stable across a later scan retry; CandidateIdentity prevents an exact evidence/content duplicate from creating another Decision Candidate. Candidates are persisted through the existing Review Queue pipeline.

The additive Prisma migration and [ERD](../../../docs/diagrams/v1-data-model.md) document SyncJob and its per-guild lock. Verification: BE/Bot/FE builds passed; focused Sync Job persistence/restart/HTTP tests passed (3), Bot tests passed (9), and FE tests passed (7). The full BE suite had one existing migration fixture mismatch: the actual migrated object includes `updatedAt`, while the fixture expectation omits it; all other tests passed. No live Discord/AI calls or operating database were used.

