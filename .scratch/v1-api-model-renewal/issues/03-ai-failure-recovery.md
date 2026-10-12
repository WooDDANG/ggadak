# 03: AI 공급자 설정과 실패·재시도 처리 정상화

**What to build:** 선택한 AI 공급자로 분석하며 운영 환경의 분석 실패를 정상 결과로 오인하지 않고 같은 Analysis Request로 재시도한다.

**Blocked by:** 01: BE 미사용 코드와 중복 구현 정리

**Status:** resolved

- [x] AI_PROVIDER와 키 설정을 하나의 설정 정책으로 적용하고 미지원 공급자·키 누락을 명확히 처리한다.
- [x] 운영 환경에서는 API 오류·잘못된 응답을 휴리스틱 결정으로 대체하거나 정상적인 무결정 결과로 처리하지 않는다.
- [x] 휴리스틱 추출은 명시적으로 선택한 개발·테스트 모드에서만 사용하고 테스트는 고정 AI 응답을 주입한다.
- [x] 실패한 요청은 재시도 가능하게 남고 봇의 실패 표시·처리 반응 정리와 재시도 후 후보 조회를 검증한다.



## Verification

- AI_PROVIDER selects exactly one provider; default is Gemini, both Gemini key names are supported, missing/unsupported keys/providers fail explicitly. Production never falls back to heuristic candidates. Mock extraction requires explicit mock provider and development/test environment.
- Fixed external AI responses verify missing key, HTTP failure, invalid schema and valid no-decision behavior. Existing isolated repository tests verify failed extraction remains retryable under the same Analysis Request and subsequent candidate history survives.
- Bot persists complete payload and stable request ID before sending, using synced files and atomic publication. ANALYSIS_DELIVERY_DIR must be persistent in deployment. Restart retry retains original payload; changed evidence under an existing pending ID is rejected. HTTP errors and malformed success remain pending.
- ClientReady starts a bounded recovery pass (one delivery per minute, 50-second request timeout). Success removes failure/processing reactions; only actual candidates receive the note reaction. Event failures remove processing and mark warning. Scans throw before checkpoint advancement; no-decision completion may advance. Checkpoint writes propagate failures.
- BE and bot TypeScript compilation passed. Adapter tests (4), durable delivery/Discord boundary tests (5), existing bot tests (6), isolated discussion/retry tests (9), repository/migration/extraction tests (18), HTTP server tests (8) passed. HTTP tests used an ephemeral local port outside the sandbox; no live database or external credentials were used.
- Public successor seam: BackendApiService.analyzeDiscussion accepts optional caller-supplied requestId; retryPendingAnalyses(limit) returns recovered {payload,result}. Scan Range ordering and manual Sync Job coordination remain ticket 09.


## Retry fairness follow-up

- Automatic retries now persist attempt counts, exponential backoff (60 seconds then 120 seconds), and a three-attempt budget before every dispatch. This also bounds attempts interrupted by process termination. Permanent 4xx failures (except 408/429), invalid result shapes, and exhausted deliveries stay on disk but stop automatic retry.
- The retry batch selects eligible work before applying its limit and orders by retry time, so a retained permanent failure or a request waiting for backoff cannot starve later deliveries.
- Legacy bare-payload journal files remain readable. New journal envelopes preserve the exact original payload/request ID independently of retry metadata.
- Explicit BackendApiService.retryAnalysisRequest(requestId) resets the retained request budget and retries its original payload; no new identity or evidence is generated.
- Bot TypeScript compilation and seven delivery/Discord boundary tests pass, including permanent-first fairness, restart-persistent backoff/exhaustion, and explicit same-ID recovery.
