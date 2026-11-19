# 01: Verify 전용 프롬프트로 출력 지시 분리

**What to build:** Verify가 Decision Graph를 검증할 때 그래프 생성 결과와 검증 결과를 동시에 반환하라는 충돌 없이, 검증 결과에 맞는 지시를 받아 Analysis Request가 정상적으로 검증과 Review Queue 발행까지 진행되도록 한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Verify 프롬프트는 검증에 필요한 그래프 규칙을 유지하면서 검증 결과의 필드와 타입을 명확히 요구하고 그래프 생성 결과를 반환하라는 지시를 포함하지 않는다.
- [ ] 새 프롬프트가 필요한 경우 새 분석에만 적용하며, 기존 프롬프트 버전으로 저장된 분석은 기존 지침으로 재개한다.
- [ ] Extract·Verify·Repair 전체 흐름과 기존 체크포인트 재개를 자동 테스트로 검증한다.
- [ ] 기존 프롬프트 지시 충돌은 관찰된 결함으로 기록하되, 실제 운영 오류의 원인으로 확정하지 않는다.
