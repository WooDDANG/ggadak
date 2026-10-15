# 한국어 샘플 실제 분석 — 2026-10-15

외부 사용자 대화 대신 직접 작성한 4발화 샘플을 gemini-3.8-flash로 분석했다. 평가 runner는 baseline과 production workflow에 같은 입력을 넣고 임시 SQLite에 저장·조회한다. 운영 DB/Discord는 사용하지 않았다.

## 입력

1. 민수: 이번 MVP 데이터베이스는 PostgreSQL로 가자는 제안입니다. 트랜잭션이 필요해서요.
2. 지연: 동의합니다. PostgreSQL로 결정하죠.
3. 민수: 그러면 제가 DB 연결을 구현하겠습니다.
4. 지연: 캐시는 Redis 도입도 검토해보면 좋겠어요. 아직 확정하지는 맙시다.

## 결과

- 새 workflow completed: 추출·의미 검증 2회, repair 0회, 약 16.3초.
- PostgreSQL 후보 observation=agreed, rationaleStatus=stated. 근거 노드의 트랜잭션 필요성과 supports 관계를 보존했다.
- Redis 후보 observation=proposed, rationaleStatus=not_stated. 미합의를 자동 확정하지 않았다.
- ActionItem은 DB 연결 구현, assignee=민수, dueDate=null. PostgreSQL 후보와 triggers 관계를 저장했다.
- 두 후보에 decisionId와 version=1이 연결된 graph를 임시 DB에서 조회했다.
- baseline은 선택 Action Item 필드에 null이 반환되어 기존 응답 스키마 검사에서 실패했다. 성공 후보를 보고하지 않고 failed로 남았다. [후속 티켓](issues/09-baseline-nullable-response.md).
- 전체 3회 호출, 공급자 total usage 합계 6043토큰. 실행 한도: 최대 5회/100000토큰/output 8192/input 100000자.

원본 입력/보고서는 ignored `.data/evaluation/korean-sample-2026-10-15.jsonl`, `.data/evaluation/korean-live-2026-10-15.json`에 있다. 합성 샘플 1건이며 사람이 검수한 서비스 gold나 정량 품질 평가로 간주하지 않는다. HTTP UI 및 실제 Discord 채널 검증은 포함하지 않았다.

## Baseline 수정 후 재검증

[09번](issues/09-baseline-nullable-response.md) 수정 후 같은 샘플의 baseline/workflow 모두 completed. Baseline은 PostgreSQL 합의 1건, workflow는 기존처럼 PostgreSQL 합의와 Redis 미합의 제안 2건을 반환했다. 총 3회 호출/6261토큰. baseline usage는 input=1792/output=214로 기록된다. 재실행 보고서는 `.data/evaluation/korean-live-baseline-fixed-2026-10-15.json`이다.
