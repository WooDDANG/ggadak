# 02: 오류 결과의 한 번 수정과 실행 예산 적용

**What to build:** 잘못된 추출 결과를 한 번만 수정하고 다시 검증해 유효할 때 제출한다. 수정 불가·반복 오류·시간 소진은 비민감 원인과 함께 실패 조회에 남는다.

**Blocked by:** 01: 검증된 후보·논리 그래프의 분석부터 조회까지 연결.

**Status:** resolved

- [x] 구조 오류와 의미 오류가 같은 수정 한 번 예산을 공유한다. 정상 2회, 의미 수정 최대 4회, 첫 구조 보정 최대 3회의 논리 호출 경로를 확인한다.
- [x] 수정 결과는 코드 구조 검사와 AI 의미 검증을 다시 통과해야 한다. 구조 보정 이후 의미 오류가 남으면 두 번째 수정 없이 실패한다.
- [x] 수정으로 동일 요소 ID를 임의 변경하지 않고 추가 요소만 새 ID를 받는다. 실제 대화 모순·철회·순환 의존은 오류를 숨기거나 관계를 삭제하는 대신 정상 보존한다.
- [x] 호출 45초·세션 활성 시간 180초, 남은 예산 기준 timeout, 취소, SDK 숨은 retry 제어를 적용하고 단계/시도/usage를 구별해 기록한다.
- [x] provider parse/불완전 출력/refusal/설정 오류/일시 통신 장애와 terminal validation/budget를 구별한다. terminal은 같은 ID 재전송으로 AI를 재호출하지 않는다.
- [x] 상태 조회 API는 미완료·실패·retryable·단계·소비 예산·graphAvailable을 구별하고 서버 권한을 확인한다. credentials/stack/owner token을 반환하지 않는다.
- [x] 구조 수정 성공·의미 수정 성공·예산 공유·수정 후 실패·검증된 후보 없음·timeout을 실제 API와 고정 응답으로 검증한다. 시간 경계만 제어 시계를 사용한다.
- [x] 상태·오류·graph 미공개 정책을 Swagger와 공유 문서에 반영하고 Governance Score가 검증을 우회하지 않음을 확인한다.

## Scope clarification

기존 production 분석 알고리즘과 호출부를 새 workflow로 전환하는 리팩토링이다. 구형 경로·중복 정책은 전환 뒤 제거하고 단일 호출 baseline만 평가 도구에 보존한다. 주 검증 경계는 승인된 실제 HTTP API·임시 SQLite·고정 AI 응답이다.

## Answer

2026-10-14: 구현과 최종 회귀 검증 완료. [구현 검증 기록](../implementation-verification.md)과 [공급자 경계 ADR](../../../docs/adr/0022-explicit-provider-http-for-bounded-analysis.md)을 참고한다. FE 소스·운영 DB 적용·유료 AI 실행은 이번 완료 범위에 포함하지 않는다. 평가 도구 완료는 실제 모델 정확도나 한국어 gold 확보 완료를 뜻하지 않는다.
