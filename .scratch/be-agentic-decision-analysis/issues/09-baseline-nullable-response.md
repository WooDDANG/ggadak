# 09: 비교 baseline의 선택 Action Item 필드 null 호환성

**Status:** needs-triage

## 관찰

2026-10-15 한국어 실제 평가에서 production workflow는 완료됐지만 baseline은 스키마 검사에 실패했다. Gemini가 Action Item의 id, transferredFromDecisionId, transferredFromActionItemId, transferredToDecisionId, dueDate에 null을 반환했고 baseline schema는 optional string만 허용한다.

공통 strictSchema 변환은 optional 필드를 required+nullable로 전송한다. 따라서 공급자에게 허용한 null과 baseline parser가 허용하는 값이 맞지 않는다.

## 검토할 수정 범위

- baseline의 고정 분석 의미를 바꾸지 않으면서 전송 계약/파싱 계약을 맞춘다. null을 보완하는 과정에서 ID·이관 정보·기한을 만들어 넣지 않는다.
- 실제 실패 응답 형태를 offline fixture/transport로 재현하고, 누락·null·실제 값 처리와 production graph 경로 분리를 검증한다.
- baseline 파싱 실패가 발생해도 공급자의 사용량이 baseline usage에서 사라지지 않는지 점검한다. 이번 전체 consumption은 6043토큰이지만 baseline stage usage는 파싱 이후 누적이라 0으로 기록됐다.

[실제 검증 기록](../korean-live-verification-2026-10-15.md). 이 티켓은 평가 baseline 도구를 다루며 production 분석 실패로 분류하지 않는다.
