# 01: Review 정책을 DecisionService로 이관

Type: task
Status: resolved
Priority: P2
Blocked by: none

## Problem

`apps/be/src/repositories/decision.repository.ts`의 `reviewDecision`은 `ReviewActionSchema.safeParse`와 검수 가능 상태, replacement 조건, Action Item 분류·취소·이전 정책을 직접 처리한다. `DecisionService.reviewDecision`은 단순 위임한다. [ADR-0021](../../../docs/adr/0021-backend-layered-architecture-and-vitest.md)의 “Services: Own domain business logic, state transition constraints, optimistic locking decisions” 및 “Repositories: Must not know about … Zod parsers”에 위배된다. 기존 edit 정책 이관만으로 review 경계까지 완료된 것은 아니다.

## Scope

- Review 입력 검증과 상태 전이·replacement·Action Item disposition 정책을 Service로 옮긴다.
- Repository는 HTTP DTO와 Zod를 참조하지 않는 영속화 계약을 받고 조회·트랜잭션·조건부 쓰기를 담당한다.
- Service에서 읽은 상태만 믿고 무조건 저장하지 않는다. 트랜잭션 안에서 candidate/predecessor 버전 및 Decided 상태를 원자적으로 보장하고 Service가 충돌 의미를 해석한다.
- 독립 확인, 보류, 거절, reviewer 편집, 승인자·승인 시각, Supersede와 Pivot 구분, rejected evidence 기록을 보존한다.

## Acceptance

- [x] Review 정책과 Zod 파싱이 Service에 있고 Repository의 review 경로에서 제거된다.
- [x] 동일 predecessor를 두 리뷰가 교체하면 하나만 성공하고 다른 요청은 conflict를 반환한다.
- [x] stale candidate/predecessor 및 잘못된 disposition은 candidate·predecessor·Action Items를 변경하지 않는다.
- [x] unknown Action Item 분류, unfinished item 취소·이전, completed item 보존과 transfer provenance를 검증한다.
- [x] Independent Retention은 predecessor를 변경하지 않으며 성공한 교체와 audit 기록은 원자적으로 저장된다.
- [x] 기존 review HTTP·저장소 회귀 테스트와 Service 정책 테스트를 격리 DB에서 통과한다. FE 변경은 없다.

## References

[후속 스펙](../spec.md), [Web-owned review](../../../docs/adr/0019-web-owned-decision-review.md), [원래 원자적 검수 티켓](../../project-reliability-repair/issues/06-atomic-review-and-action-items.md).

## Answer

ReviewAction 입력 검증, 검수 가능한 상태, replacement 및 Action Item 분류·취소·이전 정책을 DecisionService로 옮겼다. 같은 트랜잭션에서 predecessor의 버전·Decided 상태 및 candidate 버전을 조건부로 갱신한다. Repository는 준비된 도메인 엔티티만 저장하며 Zod 의존을 제거했다. 기존 검수 정책 테스트를 Service seam으로 옮겼고, 거절 증거 기록 실패 시 전체 review rollback 검증을 추가했다.

검증: [verification.md](../verification.md).
