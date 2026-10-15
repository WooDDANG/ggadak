# 09: 비교 baseline의 선택 Action Item 필드 null 호환성

**Status:** resolved

## 관찰

2026-10-15 한국어 실제 평가에서 production workflow는 완료됐지만 baseline은 스키마 검사에 실패했다. Gemini가 Action Item의 id, transferredFromDecisionId, transferredFromActionItemId, transferredToDecisionId, dueDate에 null을 반환했고 baseline schema는 optional string만 허용한다.

공통 strictSchema 변환은 optional 필드를 required+nullable로 전송한다. 따라서 공급자에게 허용한 null과 baseline parser가 허용하는 값이 맞지 않는다.

## 검토할 수정 범위

- baseline의 고정 분석 의미를 바꾸지 않으면서 전송 계약/파싱 계약을 맞춘다. null을 보완하는 과정에서 ID·이관 정보·기한을 만들어 넣지 않는다.
- 실제 실패 응답 형태를 offline fixture/transport로 재현하고, 누락·null·실제 값 처리와 production graph 경로 분리를 검증한다.
- baseline 파싱 실패가 발생해도 공급자의 사용량이 baseline usage에서 사라지지 않는지 점검한다. 이번 전체 consumption은 6043토큰이지만 baseline stage usage는 파싱 이후 누적이라 0으로 기록됐다.

[실제 검증 기록](../korean-live-verification-2026-10-15.md). 이 티켓은 평가 baseline 도구를 다루며 production 분석 실패로 분류하지 않는다.

## Answer

2026-10-15: baseline의 각 객체에서 기존 schema가 누락을 허용하는 필드만 null을 누락 값으로 해석한다. Action Item ID/이관 정보/기한을 만들어 넣지 않으며 기존 defaults는 유지한다. 필수 null은 계속 거절하고 shared/production graph schema는 변경하지 않았다. Provider response 사용량은 파싱 전에 누적하여 실패해도 보존한다.

회귀 테스트에서 기존 null 파싱 오류와 usage=0 문제를 재현한 뒤 수정했다. 누락/null/실제 값, required null, strict 전송 스키마, graph null 보존, 실패 usage를 검증했다. typecheck, lint(기존 logger 경고 1개), 변경 파일 Prettier, 전체 npm test(BE 93개/E2E 6개 포함)가 통과했다. Standards/Spec 리뷰 확정 지적 0개.

같은 합성 한국어 샘플을 실제 gemini-3.8-flash로 재평가하여 baseline/workflow 모두 completed를 확인했다. Baseline은 PostgreSQL 합의 1건, workflow는 PostgreSQL agreed/Redis proposed 2건을 반환했다. 총 3회 호출/6261토큰, 임시 DB만 사용했다. 보고서는 ignored `.data/evaluation/korean-live-baseline-fixed-2026-10-15.json`에 보존했다. 표본 한 건의 실행 성공을 서비스 품질 목표 달성으로 간주하지 않는다.
