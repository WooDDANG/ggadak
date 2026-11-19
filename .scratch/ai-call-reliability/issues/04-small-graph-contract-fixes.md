# 04: 그래프 계약의 작은 불일치 정리

**What to build:** 모델 출력의 사소한 형식 차이 때문에 구조 복구 예산을 쓰거나 호출 자원을 낭비하지 않게 한다.

**Blocked by:** degraded-analysis-recovery/01: 손상된 분석 세션의 검증과 후보 발행

**Status:** ready-for-agent

- [ ] 프롬프트의 `at` 설명을 스키마와 맞춘다. 프롬프트는 "ISO date"라 하고 스키마는 오프셋이 있는 datetime만 받는다(`src/extractor/graph-prompt.ts:8`, `src/domain/decision-graph.ts:35`).
- [ ] 노드 ID처럼 관계의 참조 ID도 trim한다(`src/domain/decision-graph.ts:24, 46-47`).
- [ ] 호출 예산 확인을 키 임대·분당 호출 슬롯 예약보다 먼저 한다(`src/services/graph-workflow.ts:171-178`).
- [ ] 세 경우를 각각 테스트한다.

`graph-workflow.ts`와 `decision-graph.ts`는 `degraded-analysis-recovery/01` 작업과 겹치므로 그 작업이 병합된 뒤 시작한다.

## Comments

**2026-11-19 구현:** 참조 ID trim만 테스트를 먼저 써서 빨강에서 초록으로 확인했다. 날짜 문구는 프롬프트 변경이라 가짜 모델로 검증할 수 없고, 예산 확인 순서는 테스트 없이 순서만 옮겼다. BE 테스트 248건, Bot 테스트 55건과 타입 검사는 통과했다. 구현 후 내린 결정은 `../spec.md`의 '결정 기록'에 있다.
