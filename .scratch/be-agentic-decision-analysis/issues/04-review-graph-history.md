# 04: 검수·편집 이후 그래프 snapshot과 카드 이력 연결

**What to build:** 사람이 카드를 편집·확정·교체한 뒤에도 당시 AI 그래프를 조회하고 현재 카드와 달라졌는지 확인한다. 여러 분석이 같은 카드와 연결되어도 이력을 잃지 않는다.

**Blocked by:** 01: 검증된 후보·논리 그래프의 분석부터 조회까지 연결.

**Status:** resolved

- [x] 완료 AI snapshot의 내용·노드·관계·관측은 인간 편집/검수로 덮어쓰지 않는다. 실제 카드 ID·분석 당시 version·현재 version으로 차이를 표현한다.
- [x] 기존 카드 analysis history에 requestId·graphAvailable·candidateNodeIds를 추가해 여러 분석으로 이동할 수 있다. legacy 이력은 없는 graph를 만들지 않는다.
- [x] 근거 미언급 후보의 편집에서 stated/not_stated 전환이 카드에 반영되지만 분석 snapshot은 유지된다. 기존 expectedVersion·동시성·Supersede·Action Item 처리는 보존한다.
- [x] 대화상 agreed/withdrawn/conflicts가 서비스 승인/폐기/교체로 자동 적용되지 않는다. 기존 카드 재사용 시 상태를 초기화하지 않는다.
- [x] 그래프 조회에 최신 카드를 섞어 과거 내용을 변경하지 않는다. 해당 guild 외 요청은 거절하고 AI 입력 원문·비밀 진단을 일반 응답에 추가하지 않는다.
- [x] 실제 HTTP 검수/편집/교체·재분석 뒤 graph/history 재조회로 불변 snapshot과 여러 연결을 확인하고 Swagger 및 FE 공유 문서를 갱신한다.

## Scope clarification

기존 production 분석 알고리즘과 호출부를 새 workflow로 전환하는 리팩토링이다. 구형 경로·중복 정책은 전환 뒤 제거하고 단일 호출 baseline만 평가 도구에 보존한다. 주 검증 경계는 승인된 실제 HTTP API·임시 SQLite·고정 AI 응답이다.

## Answer

2026-10-14: 구현과 최종 회귀 검증 완료. [구현 검증 기록](../implementation-verification.md)과 [공급자 경계 ADR](../../../docs/adr/0022-explicit-provider-http-for-bounded-analysis.md)을 참고한다. FE 소스·운영 DB 적용·유료 AI 실행은 이번 완료 범위에 포함하지 않는다. 평가 도구 완료는 실제 모델 정확도나 한국어 gold 확보 완료를 뜻하지 않는다.
