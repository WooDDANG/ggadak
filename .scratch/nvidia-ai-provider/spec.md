# Spec: NVIDIA NIM AI Provider Integration

## Overview
GGADDAK 백엔드(`apps/be`)의 AI 의사결정 추출·검증·복구 엔진을 기존 Antigravity CLI(`agy`) 서브프로세스 방식에서 NVIDIA NIM OpenAI 호환 API(`https://integrate.api.nvidia.com/v1`) 기반으로 전환합니다.

## Requirements
1. **Dual Provider 지원**: `AI_PROVIDER` 환경변수로 `nvidia`와 `agy`를 모두 지원하며, 기본값은 `nvidia`.
2. **모델 및 토큰 규격**:
   - 기본 모델: `nvidia/nemotron-3.5-super-vl-120b-a12b` (Extract, Verify, Repair 3단계 공통 적용)
   - 기본 최대 출력 토큰: 16,384 (`AI_MAX_OUTPUT_TOKENS=16384`)
3. **Thinking(추론) 및 타임아웃**:
   - `NVIDIA_ENABLE_THINKING` (기본값 `true`, 환경변수로 비활성화 가능)
   - `AI_CALL_TIMEOUT_MS` (기본값 20,000ms = 20초)
   - 20초 타임아웃 초과 시 503 Service Unavailable로 분류하여 에러 전파
   - 스트리밍 중 수집되는 `reasoning_content`를 백엔드 debug 레벨로 로깅
4. **파싱 및 복구**:
   - 마크다운 코드블록 정규화 및 JSON 파싱 (`extractAndParseJson`)
   - 파싱 실패 시 어댑터 자체 숨겨진 재시도 없이 상위 에이전트의 `repairGraph` 단계로 위임
   - 텍스트 분석에 집중하고 비전 멀티모달 분석은 후속 작업으로 분리
