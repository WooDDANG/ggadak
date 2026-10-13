# 04: Sync Job 실행 임대 갱신과 서버별 중복 방지

Type: task
Status: resolved
Priority: P2
Blocked by: none

## Problem

`apps/be/src/services/sync-job.service.ts`는 120초 임대를 부여하고 만료된 PROCESSING Job의 서버 잠금을 삭제해 새 Job 생성을 허용한다. Bot은 `apps/bot/src/bot/client.ts`에서 채널 스캔이 끝나야 진행 상태와 임대를 갱신한다. 채널 수집·분석이 120초를 넘으면 기존 작업이 계속 실행 중인데도 새 요청이 202로 승인된다. 기존 Job도 재획득 가능해 서버에 중복 작업이 남는다.

원래 [Ticket 09](../../v1-api-model-renewal/issues/09-manual-sync.md)의 요구: “중복 동기화는 409로 처리하고 forceFullSync의 범위·재분석 정책을 명시한다.”

## Scope

- 긴 채널 스캔 중에도 heartbeat로 실행 임대를 갱신하고 작업 종료·실패 때 timer를 해제한다.
- 미종료 Job의 서버 잠금은 유지하고 만료된 Job은 같은 ID로 복구한다. 복구 가능성을 새 작업 생성 허용과 혼동하지 않는다.
- claim 소유자 또는 실행 세대를 검증하여 임대를 잃은 worker의 heartbeat·진행·종료 쓰기가 새 소유자의 상태를 덮어쓰지 않도록 한다.
- 임대 상실 시 새 채널 작업을 시작하지 않고 진행 중 작업의 결과를 안전하게 처리하는 규칙을 정의한다.
- 내부 BE/Bot 계약 변경은 함께 반영하며 service 인증을 유지한다.

## Acceptance

- [x] 제어 가능한 clock/어댑터로 120초보다 긴 스캔을 실행해도 heartbeat가 유지되고 동일 guild의 새 요청은 409다.
- [x] Bot crash 후 임대 만료 시 동일 Job만 재획득되며 새 Job이 기존 잠금을 대체하지 않는다.
- [x] 두 worker가 재획득을 경합해도 하나만 소유권을 얻고 이전 소유자의 쓰기는 거절된다.
- [x] terminal 상태 이후 heartbeat가 멈추고 잠금이 해제되어 새 동기화 요청이 성공한다.
- [x] 다른 guild의 동기화는 독립적으로 실행된다. 외부 Discord/AI 호출 및 FE 수정 없이 검증한다.

## References

[후속 스펙](../spec.md), [동기화 집계 티켓](03-sync-restart-progress.md). 공유 파일 변경은 순차 통합한다.

## Answer

채널 스캔 중 30초 heartbeat로 120초 임대를 갱신하고 종료 시 timer를 정리한다. 임대 만료는 같은 Job의 복구만 허용하고 서버 잠금을 유지한다. claim owner를 저장하고 heartbeat·진행·종료 쓰기를 소유자 및 임대 조건으로 fence한다. 임대 상실 후 다음 채널을 시작하지 않는다. 긴 스캔·이전 worker 차단·claim 경합·다른 guild 독립 실행을 검증했다.

검증: [verification.md](../verification.md).
