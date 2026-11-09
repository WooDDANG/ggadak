# Spec: Grafana + Loki AI Execution Monitoring

## Overview
GGADDAK 백엔드의 AI(NVIDIA NIM / AGY) 호출 횟수, 지연 시간(durationMs), 토큰 사용량, 단계별 비율, 성공/실패 여부를 정형 로그로 기록하고, Grafana + Loki + Promtail 스택(포트 `3005`)을 통해 실시간으로 시각화 대시보드를 제공합니다.

## Requirements
1. **정형 메트릭 로깅**:
   - `AiAdapter` 호출 시 `performance.now()`로 시작/종료 지연 시간 측정
   - `apps/be/logs/ai-metrics.log` 파일에 JSON-Lines 형식으로 기록 (`timestamp`, `stage`, `model`, `provider`, `durationMs`, `inputTokens`, `outputTokens`, `success`, `error`)
2. **모니터링 인프라 (Docker Compose)**:
   - `docker-compose.monitoring.yml`
   - Loki: 내부 포트 3100
   - Promtail: `apps/be/logs/ai-metrics.log` 테일링 및 Loki 전송
   - Grafana: 포트 `3005` 바인딩 (환경변수 `GRAFANA_PORT` 지원, 기본 3005)
3. **사전 프로비저닝 대시보드 & 스크립트**:
   - 접속 시(`http://localhost:3005`) 인증 없이 즉시 AI 전용 대시보드 오픈
   - 패널:
     - 분당 AI 호출율 (Calls per Minute)
     - AI 실행 시간 타임라인 (20초 타임아웃 경고 라인)
     - 단계별(Extract/Verify/Repair) 호출 파이 차트
     - 사고 과정(Thinking) 및 에러 로그 스트림 테이블
   - 루트 `package.json`에 `npm run monitoring:up` / `npm run monitoring:down` 스크립트 등록
