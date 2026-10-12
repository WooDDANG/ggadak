# 06: 의사결정 비즈니스 유효성 검증 로직 Service 이관

**What to build:** DB 저장소에 비정상적으로 위치해 있던 상태 전이 규칙(`Superseded`/`Rejected` 수정 불가), 대체안 ID 중복 검사, 낙관적 락 버전 검증 비즈니스 룰을 `DecisionService`로 이관한다.

**Blocked by:** 05: Repository 계층에서 DTO 의존성 완전 제거

**Status:** ready-for-agent

- [ ] `DecisionService.editDecision`에 DTO Zod 파싱 및 유효성 검증 로직을 배치한다.
- [ ] 과거 결정 수정 제한, 대체안 식별자 유효성 검사, 버전 충돌 판정 로직을 `DecisionService` 내부 도메인 메서드로 구현한다.
- [ ] `DecisionService`가 비즈니스 검증 후 경량화된 `DecisionRepository` 메서드를 호출하도록 연결한다.
- [ ] 기존 의사결정 수정 통합 테스트(`decision-edit.test.ts`)가 변경된 서비스 계층을 통해 100% 동일하게 통과함을 검증한다.
