# 03: 재시작 복구와 다중 세션의 원자 공개

**What to build:** 서버가 분석 중 꺼져도 완료 단계부터 이어가고, 한 요청의 모든 세션이 성공했을 때만 후보와 그래프를 공개한다. 같은 요청 재시도는 수정·시간 예산을 늘리지 않는다.

**Blocked by:** 02: 오류 결과의 한 번 수정과 실행 예산 적용.

**Status:** needs-triage

- [ ] 원본 입력·설정/prompt/schema 버전·세션 분할을 최초 요청에 고정하고 동일 ID·다른 입력은 conflict다. 설정 변경은 새 재분석 요청으로만 적용한다.
- [ ] 단계 완료 결과·임시 참조/BE ID 매핑·검증 결과·수정 소비·시간 소비를 DB에 보존하고 재시작에서 같은 값을 재사용한다.
- [ ] 통신 장애 뒤 완료한 추출을 반복하지 않고 검증부터 이어간다. 활성 시도 시작/deadline을 저장해 crash 소비 시간을 보수적으로 정산하며 retry 대기만 제외한다.
- [ ] checkpoint와 최종 commit에 owner/lease fencing을 적용한다. 소유권을 잃은 실행은 다음 호출·저장을 중단하고 late response를 버린다.
- [ ] 다중 세션의 중간 후보/그래프는 카드 목록·검수 큐·검색·완료 graph API에 노출되지 않는다. 한 세션 terminal이면 요청 전체 실패, transient이면 완료 세션을 재사용한다.
- [ ] Graph·후보 생성/재사용·분석 연결·요청 완료를 한 transaction으로 공개한다. commit 장애·응답 유실·동시 재전송 뒤 같은 카드/graph/result가 유지된다.
- [ ] AI 응답과 checkpoint 사이 crash는 외부 exactly-once 보장이 아님을 명시하고, 재호출 시 예산을 잊지 않으며 중복 공개를 막는다.
- [ ] HTTP API·임시 SQLite를 재시작해 단계 재개·수정/시간 예산·stale owner·마지막 세션 실패·commit 실패를 검증한다. additive migration과 상태 조회/Swagger를 함께 갱신한다.
