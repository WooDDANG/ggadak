# Decision: 03. 듀얼 포맷터 및 파일/터미널 분리 구조

## Context & Problem Statement
사용자 요구사항:
- 외부 알림 웹훅은 배제.
- 로컬 개발 터미널에서는 한눈에 단계가 보이는 컬러/이모지/소요시간 시각화 로그 출력.
- 파일 저장(`logs/` 디렉터리)은 `combined.log`, `error.log` 외에 `preprocessing.log`를 분리하여 JSON 구조화 로그 또는 파이프라인 전용 로그로 보존.

## Decision Outcome
1. **터미널 콘솔 포맷 (`pretty`)**:
   - `[YYYY-MM-DD HH:mm:ss] [SERVICE] [LEVEL] <이모지> [Stage] 메시지 (+소요ms)`
   - 가독성을 위해 메타데이터는 인라인 요약으로 출력.
2. **파일 저장 포맷 (`logs/`)**:
   - `logs/combined.log`: 전체 통합 로그 (JSON 또는 상세 텍스트)
   - `logs/error.log`: 에러 전용 로그
   - `logs/preprocessing.log`: 데이터 전처리(수집, 룰 필터링, 디스인탱글링, 토픽 슬라이싱, 3중 게이트) 전용 트레이스 로그
