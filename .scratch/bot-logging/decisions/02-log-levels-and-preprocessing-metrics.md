# Decision: 02. 로그 레벨 정책 및 데이터 전처리 단계별 로깅 상세도

## Context & Problem Statement
데이터 전처리 과정(Tier 1 잡담 제거, 대화 얽힘 해소, 세션/토픽 분할, 3중 게이트 판정)의 세부 진행 내역과 메트릭을 추적하면서도, 운영 환경에서 과도한 노이즈가 발생하지 않도록 명확한 레벨 구분이 필요합니다.

## Decision Outcome
1. **DEBUG**:
   - 수집된 원본 메시지 본문 및 화자 목록
   - Tier 1 필터에서 제거된 개별 메시지 사유 (`command`, `casual`, `absorbed_as_reaction`)
   - 대화 얽힘 해소 시 복원된 부모-자식 엣지 연결 (`parentOf`)
   - TextTiling 인접 블록 간 코사인 유사도 및 계산된 Depth 점수
2. **INFO**:
   - 파이프라인 단계별 시작/완료 요약 및 소요 시간 (`[Timer] Stage completed in 12ms`)
   - 전처리 단계별 압축률 (`15 raw -> 11 clean -> 2 threads -> 1 session`)
   - 3중 게이트 판정 결과 및 사유 (통과/탈락 신호별 체크 상태)
   - 최종 결정 추출 건수 및 거버넌스 스코어
3. **WARN**:
   - 채널 락 60초 TTL 안전 만료 강제 해제
   - Gemini API 에러 시 결정론적 파서 폴백 발생
4. **ERROR**:
   - HTTP 통신 실패, 파싱 예외, 봇 권한 오류
