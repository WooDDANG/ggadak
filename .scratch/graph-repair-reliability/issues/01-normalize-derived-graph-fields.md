# 01: 파생 그래프 속성(rationaleStatus) 및 중복·무효 참조 자동 정규화

**What to build:** Decision Graph의 구조 검증을 수행하기 전에, 사실 추론이나 새 근거 생성 없이 코드로 결정적으로 확정할 수 있는 파생 속성과 참조 오류를 자동 보정하여 불필요한 repair AI Call 없이 Analysis Request가 검증과 Review Queue 발행으로 이어지도록 한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] supports/opposes 엣지 연결 여부에 맞춰 Decision Candidate의 rationaleStatus(stated / not_stated)를 자동 동기화한다.
- [ ] 대칭 관계인 conflicts_with 중복 엣지를 결정적으로 정규화한다.
- [ ] 존재하지 않는 노드 ID나 엣지 ID를 가리키는 discussionProblems 참조를 안전하게 정리한다.
- [ ] 없는 근거·대안·Action Item·관측 상태를 새로 지어내지 않아 ADR-0018 원칙을 유지한다.
- [ ] 사소한 파생 불일치만 있는 추출 결과가 추가 repair AI Call 없이 검증을 통과해 Decision Candidate로 발행됨을 테스트로 검증한다.
