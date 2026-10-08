# Specification: Bot & Preprocessing Logging Enhancement

- **Feature**: `bot-and-preprocessing-logging`
- **Destination**: 봇의 수집 파이프라인과 백엔드의 5단계 데이터 전처리 라이프사이클을 Trace ID 기반으로 추적하고, 개발 터미널과 분리된 로그 파일(`logs/preprocessing.log`)에 시각화/구조화하여 기록하는 시스템 명세
- **Status**: Ready for Tickets

---

## 1. Trace ID 라이프사이클 명세
1. **발급 (Bot MessageHandler)**:
   - 메시지 수신 후 키워드/시맨틱 트리거 감지 시 고유 `traceId` 발급 (`trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
   - 디바운스 큐 및 실행 컨텍스트에 바인딩
2. **전달 (Bot ➔ BE)**:
   - `BackendApiService.analyzeDiscussion()` 호출 시 HTTP Request Header `X-Trace-Id: <traceId>` 포함
3. **전파 (BE DiscussionService & Preprocessors)**:
   - Express 미들웨어 또는 서비스 레이어에서 `traceId`를 획득하여 로거 컨텍스트에 주입
   - Tier 1 필터 ➔ Disentangler ➔ Topic Slicer ➔ 3-Way Gate ➔ AI Extractor의 모든 로그에 동일 `traceId` 기록

---

## 2. 듀얼 로거 및 로그 파일 분리 명세 (`packages/shared/src/logger.ts`)
1. **터미널 콘솔 포맷 (Visual Pretty Console)**:
   - 포맷: `[HH:mm:ss] [SERVICE] [LEVEL] <Emoji> [Stage] Message (+durationMs)`
   - 스테이지별 이모지 매핑:
     - 수집/트리거: 🎣 `[HARVEST]`
     - Tier 1 룰 필터링: 🧹 `[TIER1-FILTER]`
     - 대화 얽힘 해소: 🌲 `[DISENTANGLE]`
     - 토픽 슬라이싱: ✂️ `[TOPIC-SLICE]`
     - 3중 게이트: 🚪 `[3WAY-GATE]`
     - AI 분석: 🧠 `[AI-CORE]`
     - 사후 거버넌스: ⚖️ `[GOVERNANCE]`
2. **파일 저장 구조 (`logs/`)**:
   - `logs/combined.log`: 전체 통합 로그
   - `logs/error.log`: WARN/ERROR 전용 로그
   - `logs/preprocessing.log`: 데이터 전처리 전용 상세 로그 (DEBUG/INFO 포함, 입력 메시지 수, 필터링 수, 복원된 스레드 수, 게이트 판정 메트릭 기록)

---

## 3. 로그 레벨 및 단계별 상세도 명세
- **DEBUG**:
  - 제거된 메시지 사유 (커맨드, 감탄사, 동의어 흡수)
  - Disentangler 연결 컴포넌트 엣지 연결 (`parentOf`)
  - TextTiling 인접 블록 코사인 유사도 점수
- **INFO**:
  - 단계별 시작/종료 요약 및 소요 시간
  - 단계별 압축률 (raw ➔ clean ➔ threads ➔ sessions)
  - 3중 게이트 판정 결과 (핀: Y/N, 리액션: N개, 종결어미: Y/N)
  - 최종 추출 결과 및 침묵 회수 여부
- **WARN / ERROR**:
  - 채널 락 60초 TTL 안전 만료 강제 해제
  - LLM 호출 실패 및 대체 파서 가동
