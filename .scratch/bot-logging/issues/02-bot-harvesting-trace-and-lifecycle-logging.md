# 02 — Bot 수집 파이프라인 Trace ID 발급 및 단계별 로깅

**What to build:**
봇의 트리거 감지 시 `traceId` 발급, 디바운스 대기, 윈도우 수집(일반 앞15/뒤5, 스레드 100건), 백엔드 HTTP 호출(`X-Trace-Id` 헤더 포함) 및 이모지 반응/회수 라이프사이클의 정밀 로깅 연동.

**Blocked by:** 01 — Shared 듀얼 로거 및 전처리 전용 로그 파일 분리

**Status:** closed

- [x] `apps/bot/src/handlers/message.handler.ts`에서 키워드/시맨틱 트리거 감지 시 고유 `traceId`를 발급하고 디바운스 스케줄 로그에 바인딩한다.
- [x] `apps/bot/src/services/harvester.service.ts`의 채널 락 획득/해제, 메시지 수집 범위, `traceId` 기반 HTTP 호출 및 소요 시간을 기록한다.
- [x] 백엔드 응답 결과에 따라 `👀` 회수(Silent Cleanup) 또는 `📝` 추가 시 완료 로그를 단계별 메타데이터와 함께 출력한다.
- [x] 봇 메시지 핸들러 및 하베스터 테스트를 실행하여 정상 통과를 검증한다.
