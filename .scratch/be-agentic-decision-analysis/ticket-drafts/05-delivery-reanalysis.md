# 05: Bot 전달 복구와 terminal 재분석 구분

**What to build:** Bot이 일시 장애의 분석을 같은 ID로 복구하되 검증·예산의 영구 실패는 보존한다. 사용자가 의도적으로 다시 분석하면 새 요청으로 이전 결과와 연결한다.

**Blocked by:** 03: 재시작 복구와 다중 세션의 원자 공개.

**Status:** needs-triage

- [ ] retryable 통신 오류는 기존 bounded delivery·채널 순차 실행으로 같은 ID를 재전송하고 BE의 남은 단계/예산으로 재개한다.
- [ ] terminal validation/budget/configuration 실패는 보존·조회하고 같은 ID retry 명령으로 다시 실행하거나 소비 예산을 초기화하지 않는다.
- [ ] 기존 Bot 수동 분석 경로는 의도적 새 재분석에 새 ID와 이전 분석 연결을 제공한다. 같은 evidence/content의 기존 카드 재사용·거절/확정 상태·manual override 정책은 유지한다.
- [ ] delivery failure 조회는 사용자에게 재전송 가능한 상태와 새 분석이 필요한 상태를 구별해 전달한다. 인증·권한·retry command 멱등성을 유지한다.
- [ ] 요청 전체 완료만 scan acknowledgement로 인정하고 실패 구간 때문에 checkpoint gap이 건너뛰어지지 않는다. 저장된 scan manifest와 Job progress 복구를 보존한다.
- [ ] startup/새 서버 초대 자동 스캔 제거를 유지한다. 명시적 scan/Sync Job만 과거 대화를 스캔하고 새 대화 추적·이미 요청한 분석 복구는 동작한다.
- [ ] 기존 Bot delivery/scan 테스트와 실제 BE HTTP·임시 DB 경계에서 transient 재개·terminal 무호출·수동 새 요청·checkpoint gap·재시작을 확인한다. 외부 Discord/AI 호출은 기본 테스트에 넣지 않는다.
- [ ] retained failure API/Swagger와 운영·FE 공유 문서에 바뀐 재시도 의미를 반영한다. 운영 DB·FE 소스는 변경하지 않는다.
