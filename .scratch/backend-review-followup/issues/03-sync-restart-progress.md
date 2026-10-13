# 03: Sync Job 재시작 복구의 진행 집계 수정

Type: task
Status: resolved
Priority: P2
Blocked by: none

## Problem

`apps/bot/src/bot/client.ts`의 Sync Job worker는 저장된 `completedChannels`, `failedChannels`, 메시지·결정 건수를 복원한 뒤 `channelIds` 전체를 재순회해 누적한다. 두 채널 중 하나 완료를 저장하고 재시작하면 완료 건수가 3/2가 된다. 실패한 채널의 재시도가 성공해도 이전 실패 건수가 남아 최종 상태가 FAILED가 될 수 있다.

원래 [Ticket 09](../../v1-api-model-renewal/issues/09-manual-sync.md)는 “동기화 중 재시작·AI 실패 후 복구와 중복 후보 방지, 검수 큐까지의 연결을 검증한다”를 요구한다.

## Scope

- 채널별 결과·진행 상태를 영속화하여 완료된 채널을 재집계하지 않고 미완료 채널부터 복구한다. 다른 설계를 쓰더라도 재실행 결과가 기존 집계와 중복되지 않게 한다.
- 재시도 성공으로 이전 실패가 해소되는 집계 및 최종 상태 기준을 정의한다.
- Analysis Request ID 재사용, candidate 중복 방지, Scan Range와 Channel Checkpoint 연속 완료 규칙을 보존한다.
- 저장된 채널 스냅샷과 공개 Sync Job 응답 형태를 보존한다.

## Acceptance

- [x] 2개 채널 중 첫 완료 저장 후 Bot 재시작·Job 재획득 시 최종 완료는 2/2이고 메시지·결정 건수도 중복되지 않는다.
- [x] 실패 결과 저장 후 프로세스 중단·재획득 및 성공 복구 시 해소된 실패가 최종 FAILED를 강제하지 않는다.
- [x] 응답 유실·동일 결과 재보고 시 채널 집계가 멱등적이다.
- [x] 모든 채널 결과가 확정되기 전에 Job을 COMPLETED로 표시하지 않고 실제 미해결 실패는 남는다.
- [x] 재시작 테스트가 단순 Job 재획득을 넘어 Bot worker와 영속화 경계의 최종 결과를 검증한다.
- [x] 필요한 additive migration은 fixture DB에서 기존 Job 보존을 검증하며 FE 파일은 수정하지 않는다.

## References

[후속 스펙](../spec.md), [ADR-0020](../../../docs/adr/0020-analysis-delivery-and-scan-coverage.md).

## Answer

SyncJob에 채널별 결과 JSON을 additive migration으로 추가했다. BE가 채널별 결과에서 집계를 계산하고 성공 채널을 재획득 목록에서 제외한다. 재보고는 결과를 교체하여 멱등적이며 실패 채널의 성공 복구는 실패 건수를 제거한다. Bot SyncJobWorker는 채널 결과만 보고한다. 재시작·중복 보고·실패 복구 및 기존 Job migration 보존을 검증했다.

검증: [verification.md](../verification.md).
