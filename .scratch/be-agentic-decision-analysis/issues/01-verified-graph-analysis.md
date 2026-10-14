# 01: 검증된 후보·논리 그래프의 분석부터 조회까지 연결

**What to build:** 입력 대화 하나를 분석하면 미합의 제안도 검수 후보가 되고, 별도 AI 의미 검증을 통과한 후보와 논리 그래프를 저장한 뒤 같은 서버의 사용자가 API로 조회할 수 있다. 첫 slice는 오류 결과를 보정하지 않고 실패로 남기며 정상 경로를 끝까지 연결한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 기존 TypeScript Service/Adapter/Repository 경계를 유지하고 단계별 공통 도메인 계약을 연결한다. 기존 public analyze 응답은 호환하고 새 그래프 조회는 JWT·실제 요청 guild를 검증한다.
- [x] Gemini와 OpenAI의 추출/의미 검증은 구조화 응답·인스턴스별 공급자 주입·usage·취소 경계를 사용한다. 공급자 HTTP fixture로 실제 parse를 검증하며 기본 테스트는 외부 호출이 없다.
- [x] 같은 선택의 후보 묶음, 6종 노드/관계, 후보/대안 관측, 순서 있는 요약 이력과 근거 미언급을 끝까지 보존한다. Topic/decision 필수 내용은 비어 있을 수 없고 없는 근거/과제/담당자를 만들지 않는다.
- [x] 이미 도착한 제안/문제 맥락을 합의 없음만으로 제거하지 않고 입력 밖 피드백·과거 결정을 prompt에 주입하지 않는다. 순수 잡담 룰 skip과 AI 검증된 후보 없음을 구별한다.
- [x] 정상 세션은 추출 후 코드 검사와 별도 AI 의미 검증을 항상 거친다. 구조 오류·malformed critic·의미 오류는 실패이며 저장 성공이나 정상 무결정으로 바꾸지 않는다.
- [x] 성공 시 후보·Graph snapshot·요청 완료를 원자 반영한다. 실제 카드 ID 연결·BE 문자열 ID·완료 재전송 동일 결과를 확인한다. 기존 evidence 동일성/거절 억제/카드 상태를 보존한다.
- [x] 근거 없는 후보의 카드 읽기·편집·승인을 일관되게 처리하고 명시적 rationaleStatus를 둔다. 기존 schema·DTO·필수 편집 정책이 가짜 근거를 요구하지 않도록 expand한다.
- [x] additive migration은 임시 DB에서 기존 카드·이력·checkpoint를 보존한다. legacy graph 없는 요청은 unavailable이고 자동 재분석하지 않는다.
- [x] 합의한 HTTP API/임시 SQLite/고정 AI 응답 경계에서 정상 후보·맥락만 있음·잘못된 참조·다른 guild 접근을 확인하고 Swagger·FE 공유 문서의 새 계약을 함께 반영한다. FE 소스는 수정하지 않는다.
- [x] 기존 단일 호출 baseline의 prompt/응답 해석을 평가에서 재현할 수 있도록 버전·설정을 보존한다. production의 옛 경로를 유지하는 조건으로 삼지 않는다.

## Scope clarification

기존 production 분석 알고리즘과 호출부를 새 workflow로 전환하는 리팩토링이다. 구형 경로·중복 정책은 전환 뒤 제거하고 단일 호출 baseline만 평가 도구에 보존한다. 주 검증 경계는 승인된 실제 HTTP API·임시 SQLite·고정 AI 응답이다.

## Answer

2026-10-14: 구현과 최종 회귀 검증 완료. [구현 검증 기록](../implementation-verification.md)과 [공급자 경계 ADR](../../../docs/adr/0022-explicit-provider-http-for-bounded-analysis.md)을 참고한다. FE 소스·운영 DB 적용·유료 AI 실행은 이번 완료 범위에 포함하지 않는다. 평가 도구 완료는 실제 모델 정확도나 한국어 gold 확보 완료를 뜻하지 않는다.
