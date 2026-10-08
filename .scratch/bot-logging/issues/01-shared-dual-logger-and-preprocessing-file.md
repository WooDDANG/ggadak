# 01 — Shared 듀얼 로거 및 전처리 전용 로그 파일 분리

**What to build:**
`packages/shared/src/logger.ts`에 콘솔 시각화 포맷(이모지, 스테이지, 경과시간, Trace ID)과 `logs/preprocessing.log` 전용 파일 트랜스포트 분리 구현.

**Blocked by:** none

**Status:** closed

- [x] `packages/shared/src/logger.ts`에 `Stage`, `traceId`, `durationMs` 메타데이터를 파싱하여 터미널 콘솔에 이모지와 함께 출력하는 시각화 포맷터를 구현한다.
- [x] `logs/preprocessing.log` 파일 트랜스포트를 추가하여 데이터 전처리 및 수집 관련 이벤트만 별도로 기록할 수 있도록 구성한다.
- [x] 환경변수 `LOG_LEVEL` 설정(기본값 `info`, 디버깅 시 `debug`)을 지원한다.
- [x] 로거 단위 테스트를 작성하고 포맷팅 및 파일 기록 동작을 검증한다.
