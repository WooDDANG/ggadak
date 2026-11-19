# 01: 손상된 분석 세션의 검증과 후보 발행

**What to build:** Extract 결과의 필수 형식은 JSON Schema로 제한하고, 잘못된 관계를 제거한 세션은 손상 이력을 남긴 채 검증해 통과한 Decision Candidate를 발행한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Extract의 필수 필드·타입·enum·카테고리를 Zod 기반 JSON Schema로 제한하고 미지원 엔드포인트의 동작을 명시한다.
- [ ] 대상이 없는 관계와 허용되지 않은 타입 조합의 관계를 제거하고 ID·타입·양끝 노드와 확인 가능한 타입·사유·Analysis Request 및 세션 ID를 보존한다.
- [ ] 제거 후 남은 그래프를 구조 검증하고 Verify한다. 고립된 Rationale·Action Item은 제거하지 않고 Repair하며, 없는 근거나 행동을 생성하지 않는다.
- [ ] 검증된 후보 모두에 세션 단위 손상 상태를 노출하고 영속화하며, 실패 시 정상 후보로 발행하지 않는다.
- [ ] 실제 분석 경로에서 정상 그래프·손상 그래프·고립 노드·검증 실패와 체크포인트 복원을 테스트한다.
- [ ] 기존 분석의 저장된 설정과 프롬프트 버전으로 재개하는 호환성을 유지한다.
- [ ] 잘못된 관계가 Repair를 일으킨다고 가정한 `tests/agentic-analysis.api.test.ts`의 실패 4건(:99, :127, :171, :471)을 새 계약으로 고친다. 잘못된 관계는 제거와 손상 기록을 검증하고, 구조 복구 테스트는 중복 ID나 고립 노드처럼 여전히 Repair로 가는 입력으로 바꾼다.
- [ ] identity가 없을 때 손상 기록의 requestId가 빈 문자열로 남지 않게 한다.
