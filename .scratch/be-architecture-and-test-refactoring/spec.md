# 백엔드 표준 아키텍처 및 테스트 통합 리팩토링

## 배경 및 목적

현재 백엔드(`apps/be`)는 Controller, Service, Repository, DTO 계층 간 경계가 모호하고 다음 문제를 가지고 있다:
1. `Service` 내부의 인터페이스/타입 선언 및 인라인 DTO import로 인한 의존성 결합
2. DB 접근 계층(`Repository`)이 API 계층의 `DTO`를 직접 받고 비즈니스 유효성 검증(상태 체크, 버전 검사)을 수행하는 역할 전도
3. 레포지토리마다 중복된 Prisma 인스턴스/트랜잭션/에러 변환 코드
4. Node 내장 테스트 러너(`node:test`) 기반으로 소스 코드 사이에 파편화된 테스트 파일

본 리팩토링은 Codex의 `v1-api-model-renewal` 완료 후, TS 백엔드 표준 계층형 아키텍처(Controller ➔ Service ➔ Repository ➔ DB) 원칙에 맞춰 코드를 점진적으로 정비하고 테스트 환경을 Vitest로 일원화한다.
(※ 토론 분석 파이프라인은 봇 연동 보존을 위해 현행 유지하며 차후 기획 확정 시 개편한다.)

## 설계 방향

- **점진적 확장-축소(Expand-Contract)**: DTO 분리 ➔ Base Repo 구축 ➔ Repository DTO 분리 ➔ Service 비즈니스 회수 순서로 안전하게 진행한다.
- **Repository의 DTO 비의존**: Repository는 순수 Entity 및 Primitive 파라미터만 다루며, DTO 유효성 검증은 상위 계층에서 완료한다.
- **Service의 비즈니스 책임 회수**: 도메인 상태 전이 제약 및 낙관적 락 판단은 Service 계층이 책임진다.
- **단일 패키지 매니저**: `npm` 워크스페이스 표준을 준수하고 불필요한 `pnpm` 잔재를 청소한다.

## 티켓 목록

- [01: Workspace 패키지 매니저 및 린터/포맷터 정비](issues/01-workspace-cleanup.md)
- [02: 인증/세션 전용 DTO 및 에러 분리](issues/02-auth-dto-separation.md)
- [03: 의사결정 API 입출력 Request/Response DTO 정규화](issues/03-decision-dto-normalization.md)
- [04: Base Repository 구축 및 Prisma 공통 인프라 모듈화](issues/04-base-repository.md)
- [05: Repository 계층에서 DTO 의존성 완전 제거](issues/05-repository-dto-decoupling.md)
- [06: 의사결정 비즈니스 유효성 검증 로직 Service 이관](issues/06-service-business-logic-migration.md)
- [07: Controller 계층 인가 가드 및 DTO 변환 표준화](issues/07-controller-guard-and-mapping.md)
- [08: Vitest 기반 테스트 환경 통합 및 디렉터리 분리](issues/08-vitest-test-migration.md)
