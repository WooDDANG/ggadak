# 09: 분석 원본과 실행 체크포인트 분리

**What to build:** 분석 단계가 바뀔 때마다 큰 원문과 전체 실행 기록을 다시 쓰는 양을 줄이면서, 장애 후 원래 단계와 모델 설정으로 분석을 복구할 수 있게 한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 변경되지 않는 분석 입력·설정과 자주 바뀌는 단계·시도·피드백을 구분한 버전 있는 저장 표현을 도입한다. 기존 workflow 저장 데이터는 계속 복구할 수 있다.
- [x] 실행 시작·완료·중단 checkpoint는 변경된 상태를 중심으로 저장하고, 단계 갱신마다 전체 원문을 재기록하지 않는다.
- [x] 기존 중간 분석을 새 표현으로 옮겨도 ID 매핑·수정 예산·누적 시간·실행 소유권·사용 토큰·실패 상태를 보존한다.
- [x] 완료 graph snapshot·결과 재전송·결정 근거·검수 이력을 보존한다. 입력/결과의 자동 삭제는 기존 완료 데이터 보존 티켓의 계약을 따른다.
- [x] 대형 입력의 기록량 감소를 측정하고, 추출/수정/검증 단계별 재시작·응답 유실·소유권 변경에서도 결과 동등성을 검증한다. 외부 AI 호출 없이 fixture를 사용한다.

## Answer

AnalysisSessionState에 불변 입력과 가변 상태를 분리하고 owner/lease로 checkpoint write를 fence한다. 과거 v1 root checkpoint는 재개 시 v2로 전환하며 병렬 저장 시 다른 세션 상태를 덮어쓰지 않는다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
