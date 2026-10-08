# 03 — Backend 전처리 5단계 추적 로깅 및 메트릭 기록

**What to build:**
`apps/be/src/services/discussion.service.ts` 및 전처리 컴포넌트(Tier 1, Disentangler, Topic Slicer, 3-Way Gate)에 `traceId` 전파 및 전처리 단계별 데이터 변환 메트릭(소요 ms, 건수 변화, 게이트 판정 세부 사유)의 `logs/preprocessing.log` 정밀 기록.

**Blocked by:** 02 — Bot 수집 파이프라인 Trace ID 발급 및 단계별 로깅

**Status:** closed

- [x] `apps/be/src/services/discussion.service.ts`에서 요청의 `traceId` (헤더 또는 파라미터)를 수신하여 모든 전처리 단계에 바인딩한다.
- [x] Tier 1 필터링: 제거된 메시지 사유별 통계(`commands`, `casual`, `syntheticReactions`)를 DEBUG/INFO로 기록한다.
- [x] 대화 얽힘 해소: 복원된 스레드 수, 부모 연결 관계, 버스트 머징 결과를 기록한다.
- [x] 토픽 슬라이싱: 무발화 갭 분할 및 TextTiling 유사도 깊이 점수 기반 분할 지점을 기록한다.
- [x] 3중 게이트 판정: 신호별 충족 여부(수동 핀, 리액션수, 합의어미)와 탈락/승격 사유를 명시한다.
- [x] 전체 단위/E2E 테스트를 실행하여 기능 무결성을 검증한다.
