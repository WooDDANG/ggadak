# 05: Bot 전달 복구와 terminal 재분석 구분

**What to build:** Bot이 일시 장애의 분석을 같은 ID로 복구하되 검증·예산의 영구 실패는 보존한다. 사용자가 의도적으로 다시 분석하면 새 요청으로 이전 결과와 연결한다.

**Blocked by:** 03: 재시작 복구와 다중 세션의 원자 공개.

**Status:** resolved

- [x] retryable 통신 오류는 기존 bounded delivery·채널 순차 실행으로 같은 ID를 재전송하고 BE의 남은 단계/예산으로 재개한다.
- [x] terminal validation/budget/configuration 실패는 보존·조회하고 같은 ID retry 명령으로 다시 실행하거나 소비 예산을 초기화하지 않는다.
- [x] 기존 Bot 수동 분석 경로는 의도적 새 재분석에 새 ID와 이전 분석 연결을 제공한다. 같은 evidence/content의 기존 카드 재사용·거절/확정 상태·manual override 정책은 유지한다.
- [x] delivery failure 조회는 사용자에게 재전송 가능한 상태와 새 분석이 필요한 상태를 구별해 전달한다. 인증·권한·retry command 멱등성을 유지한다.
- [x] 요청 전체 완료만 scan acknowledgement로 인정하고 실패 구간 때문에 checkpoint gap이 건너뛰어지지 않는다. 저장된 scan manifest와 Job progress 복구를 보존한다.
- [x] startup/새 서버 초대 자동 스캔 제거를 유지한다. 명시적 scan/Sync Job만 과거 대화를 스캔하고 새 대화 추적·이미 요청한 분석 복구는 동작한다.
- [x] 기존 Bot delivery/scan 테스트와 실제 BE HTTP·임시 DB 경계에서 transient 재개·terminal 무호출·수동 새 요청·checkpoint gap·재시작을 확인한다. 외부 Discord/AI 호출은 기본 테스트에 넣지 않는다.
- [x] retained failure API/Swagger와 운영·FE 공유 문서에 바뀐 재시도 의미를 반영한다. 운영 DB·FE 소스는 변경하지 않는다.

## Scope clarification

기존 production 분석 알고리즘과 호출부를 새 workflow로 전환하는 리팩토링이다. 구형 경로·중복 정책은 전환 뒤 제거하고 단일 호출 baseline만 평가 도구에 보존한다. 주 검증 경계는 승인된 실제 HTTP API·임시 SQLite·고정 AI 응답이다.

## Answer

2026-10-14: 구현과 최종 회귀 검증 완료. [구현 검증 기록](../implementation-verification.md)과 [공급자 경계 ADR](../../../docs/adr/0022-explicit-provider-http-for-bounded-analysis.md)을 참고한다. FE 소스·운영 DB 적용·유료 AI 실행은 이번 완료 범위에 포함하지 않는다. 평가 도구 완료는 실제 모델 정확도나 한국어 gold 확보 완료를 뜻하지 않는다.
