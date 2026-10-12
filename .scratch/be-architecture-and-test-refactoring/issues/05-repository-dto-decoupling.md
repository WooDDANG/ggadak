# 05: Repository 계층에서 DTO 의존성 완전 제거

**What to build:** `DecisionRepository`가 상위 계층의 DTO(`DecisionEditDto`)를 직접 파싱하던 결합을 끊고, 순수한 도메인 모델/파라미터 및 Prisma 엔티티만 다루도록 경량화한다.

**Blocked by:** 04: Base Repository 구축 및 Prisma 공통 인프라 모듈화

**Status:** ready-for-agent

- [ ] `DecisionRepository`가 `BaseRepository`를 상속하도록 구조를 변경한다.
- [ ] `DecisionRepository.editDecision`에서 `DecisionEditDto` 및 `DecisionEditSchema.safeParse` 의존성을 제거한다.
- [ ] 저장소 메서드는 순수 업데이트 속성(Entity 파라미터)을 받아 DB 트랜잭션과 영속화만 전담하도록 시그니처를 수정한다.
- [ ] 기존 저장소 기능 테스트(`decision.repository.test.ts`)가 변경된 시그니처에 맞춰 성공하도록 갱신한다.
