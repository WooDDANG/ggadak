# 02: 구조 검증 실패 피드백에 노드 타입·허용 규칙 힌트 포함

**What to build:** 자동 정규화 이후에도 남는 실제 구조 위반(허용되지 않은 엣지 연결, 필수 필드 누락, enum 불일치 등)을 repair AI Call로 전달할 때, 단순 ID 대신 실제 양끝 노드 타입과 허용 규칙을 포함한 구체적인 수정 힌트를 제공해 1회 복구 성공률을 높인다.

**Blocked by:** 01: 파생 그래프 속성(rationaleStatus) 및 중복·무효 참조 자동 정규화

**Status:** ready-for-agent

- [ ] 잘못된 엣지(Invalid endpoints) 발견 시 문제 엣지의 타입과 양끝 노드의 실제 타입, 해당 엣지 타입에 허용된 source/target 노드 타입 조합을 피드백에 포함한다.
- [ ] 불완전한 Decision Candidate나 history.observation enum 불일치(예: rejected 사용) 발견 시 누락된 필드명과 허용 가능한 enum 값 목록을 피드백에 명시한다.
- [ ] repair AI Call이 구체적 피드백을 받아 수정한 뒤 재검증을 통과하고 Decision Candidate를 정상 발행하는 엔드투엔드 흐름을 테스트로 검증한다.
- [ ] 기존 체크포인트 재개 및 구조화된 실패 분류 계약을 깨뜨리지 않는다.
