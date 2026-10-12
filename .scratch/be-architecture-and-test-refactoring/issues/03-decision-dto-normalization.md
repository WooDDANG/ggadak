# 03: 의사결정 API 입출력 Request/Response DTO 정규화

**What to build:** 의사결정(Decision) 관련 필터 및 수정 인터페이스를 `src/dto/` 계층으로 일원화하고 Zod 유효성 검증 체계를 표준화한다.

**Blocked by:** 02: 인증/세션 전용 DTO 및 에러 분리

**Status:** ready-for-agent

- [ ] `DecisionService` 내부에 정의된 `QueryDecisionsFilter`를 `src/dto/v1-decision.dto.ts`로 이전한다.
- [ ] `DecisionService.editDecision`의 인라인 DTO import(`import('../dto/decision-edit.dto.js')`)를 제거하고 상단 정식 import로 통일한다.
- [ ] DTO 파일들의 export 항목을 `src/dto/index.ts` 배럴 파일에 깔끔하게 등록한다.
- [ ] API 컨트롤러(`v1-decision.controller.ts`) 및 서비스 타입 체크가 회귀 없이 통과하는지 검증한다.
