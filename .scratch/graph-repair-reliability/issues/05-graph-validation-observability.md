# 05: 그래프 검증 실패 규칙 코드·단계의 터미널 관측성 보강

**What to build:** 구조 검증 또는 의미 검증 실패로 Analysis Request가 종료될 때, 운영자가 데이터베이스를 직접 조회하지 않고도 터미널 로그에서 어떤 검증 규칙 범주가 실패했는지 즉시 파악할 수 있게 한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] recheck 구조 검증 실패와 reverify 의미 검증 실패 시 터미널 로그에 실패 단계, 안정적인 검증 실패 범주(예: invalid-endpoints, rationale-status, incomplete-candidate, enum-mismatch, semantic-verification), 이슈 건수를 함께 기록한다.
- [ ] ADR-0027에 따라 대화 원문(Discussion Context), 전체 프로바이더 응답 본문, 자격증명은 로그로 복제하지 않고 상관관계 ID(requestId, callId, traceId)만 남긴다.
- [ ] 구조 실패 및 의미 검증 실패 시 기대한 로그 필드가 기록되고 민감·원문 데이터가 포함되지 않음을 테스트로 검증한다.

## Comments

**2026-11-19 (AI 경로 점검 후속):** 현재 코드는 이 이슈의 요구와 반대로 동작한다. `analysis.validation.failed`·`analysis.attempt.failed` 로그가 `graphResult`, `verificationResult`, `providerResponse`를 최대 8KB씩 싣는다(`apps/be/src/services/graph-workflow.ts:148, 279, 296, 325, 333`). promtail이 be.log를 Loki로 보내므로 ADR-0027 위반이다. 원문은 DB workflow 기록에만 남기고 로그에는 단계·실패 코드·건수·requestId·callId만 싣는다. `tests/agentic-analysis.api.test.ts:170`은 로그에 원문 표식이 있어야 통과하므로, 원문이 없음을 단언하도록 뒤집는다. 별도 티켓을 만들지 않고 이 이슈에서 처리한다.
