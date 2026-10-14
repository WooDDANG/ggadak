# 04: 검수·편집 이후 그래프 snapshot과 카드 이력 연결

**What to build:** 사람이 카드를 편집·확정·교체한 뒤에도 당시 AI 그래프를 조회하고 현재 카드와 달라졌는지 확인한다. 여러 분석이 같은 카드와 연결되어도 이력을 잃지 않는다.

**Blocked by:** 01: 검증된 후보·논리 그래프의 분석부터 조회까지 연결.

**Status:** needs-triage

- [ ] 완료 AI snapshot의 내용·노드·관계·관측은 인간 편집/검수로 덮어쓰지 않는다. 실제 카드 ID·분석 당시 version·현재 version으로 차이를 표현한다.
- [ ] 기존 카드 analysis history에 requestId·graphAvailable·candidateNodeIds를 추가해 여러 분석으로 이동할 수 있다. legacy 이력은 없는 graph를 만들지 않는다.
- [ ] 근거 미언급 후보의 편집에서 stated/not_stated 전환이 카드에 반영되지만 분석 snapshot은 유지된다. 기존 expectedVersion·동시성·Supersede·Action Item 처리는 보존한다.
- [ ] 대화상 agreed/withdrawn/conflicts가 서비스 승인/폐기/교체로 자동 적용되지 않는다. 기존 카드 재사용 시 상태를 초기화하지 않는다.
- [ ] 그래프 조회에 최신 카드를 섞어 과거 내용을 변경하지 않는다. 해당 guild 외 요청은 거절하고 AI 입력 원문·비밀 진단을 일반 응답에 추가하지 않는다.
- [ ] 실제 HTTP 검수/편집/교체·재분석 뒤 graph/history 재조회로 불변 snapshot과 여러 연결을 확인하고 Swagger 및 FE 공유 문서를 갱신한다.
