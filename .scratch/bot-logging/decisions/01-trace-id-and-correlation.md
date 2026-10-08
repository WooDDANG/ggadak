# Decision: 01. Trace ID 생성 및 E2E 상관관계 전달 방식

## Context & Problem Statement
봇에서 트리거가 감지된 순간(디바운스 시작)부터 윈도우 수집, 백엔드 전처리(Tier 1, 얽힘 해소, 세션 분할, 3중 게이트), LLM 판정, 이모지 회수/추가까지의 전 과정을 단일 흐름으로 추적할 수 있어야 합니다.

## Considered Options
1. **봇 트리거 시점 생성 후 HTTP 헤더(`X-Trace-Id`) 및 메타데이터 전달 (선택)**
2. 채널 ID + 메시지 ID 조합 사용
3. Bot / BE 각자 로컬 ID 생성

## Decision Outcome
- 봇의 `MessageHandler`에서 트리거 감지 시 `traceId` (`trc-${Date.now().toString(36)}-${random}`)를 생성합니다.
- 백엔드 호출 시 `X-Trace-Id` HTTP 헤더로 전달합니다.
- 모든 로그 레코드의 메타데이터에 `{ traceId }`를 포함시켜 검색 및 필터링이 가능하도록 합니다.
