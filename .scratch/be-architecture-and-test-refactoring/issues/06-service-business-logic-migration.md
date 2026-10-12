# 06: 의사결정 비즈니스 유효성 검증 로직 Service 이관

**What to build:** DB 저장소에 비정상적으로 위치해 있던 상태 전이 규칙(`Superseded`/`Rejected` 수정 불가), 대체안 ID 중복 검사, 낙관적 락 버전 검증 비즈니스 룰을 `DecisionService`로 이관한다.

**Blocked by:** 05: Repository 계층에서 DTO 의존성 완전 제거

**Status:** resolved

- [x] `DecisionService.editDecision`에 DTO Zod 파싱 및 유효성 검증 로직을 배치한다.
- [x] 과거 결정 수정 제한과 대체안 식별자 검증은 `DecisionService`가 판정한다. DTO 파싱과 상태 검증은 영속화 호출 전에 완료한다.
- [x] 버전 불일치는 Service가 도메인 충돌로 해석하고, Repository는 `WHERE id = ? AND version = ?` 조건의 단일 원자적 갱신으로 동시 수정 시 한 요청만 성공하도록 보장한다. Service에서 읽은 버전만 믿고 무조건 갱신하지 않는다.
- [x] `DecisionService`가 비즈니스 검증 후 경량화된 `DecisionRepository` 메서드를 호출하도록 연결한다.
- [x] 기존 의사결정 수정 통합 테스트(`decision-edit.test.ts`)가 변경된 서비스 계층을 통해 100% 동일하게 통과함을 검증한다.

## Implementation

DecisionService owns strict edit parsing, historical-state policy, alternative IDs and stale-version interpretation. Service concurrency and audit-failure rollback tests pass, as does the existing HTTP decision edit test.
