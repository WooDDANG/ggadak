# 07: Review Queue 검수 흐름 전환

**What to build:** 봇이 추출한 Decision Candidate를 검수 화면에서 확인하고 확정·보류·폐기하거나 기존 결정을 교체한다.

**Blocked by:** 06: 결정 모델 이전과 목록·상세 조회

**Status:** ready-for-agent

- [ ] Review Queue 목록과 상태 변경 API를 DB·생성 클라이언트·검수 화면까지 연결하고 ticketId와 decisionId의 동일 엔티티 식별 정책을 명시한다.
- [ ] 확정 날짜와 검수자를 저장하고 확정·보류·폐기 후 목록 및 상세에 반영한다.
- [ ] 오래된 버전의 검수와 이미 처리된 후보를 거부하고 서버 접근 권한을 검증한다.
- [ ] 교체는 predecessor와 successor 상태를 원자적으로 갱신하고 미완료 Action Item의 취소·이전 및 완료 이력을 보존한다.
- [ ] Evidence Hash의 폐기 후보 재생성 억제와 수동 재분석 예외를 유지하고 검수 전환을 검증한다.

