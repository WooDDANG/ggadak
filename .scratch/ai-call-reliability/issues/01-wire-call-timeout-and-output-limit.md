# 01: AI 호출 타임아웃 설정 연결과 출력 상한 정렬

**What to build:** `AI_CALL_TIMEOUT_MS`가 실제 AI 호출 제한 시간을 정하게 하고, 기본값과 출력 토큰 상한을 실측 생성 속도에 맞춘다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `apps/be/src/services/graph-workflow.ts:185`가 `GraphPolicy.callTimeoutMs` 대신 `config.ai.callTimeoutMs`를 쓴다.
- [ ] 호출 타임아웃 기본값을 20초에서 60초로, `AI_MAX_OUTPUT_TOKENS` 기본값을 16,384에서 8,192로 바꾼다. 세션 시간 예산은 300초로, Bot의 동기 전달 마감은 310초로 늘린다.
- [ ] `.env.example`, ADR-0025, `docs/agents/feature-architecture.md:128`의 설명을 실제 동작에 맞춘다.
- [ ] 환경 변수 값이 실제 호출 제한에 반영되는지 테스트한다.

## Comments

**2026-11-19 근거:** `apps/be/logs/ai-metrics.log`(11/8~11/9, 59건, nemotron-3.5-super, 개발 환경)에서 실패 15건 중 13건이 20초 타임아웃이었다(나머지는 Verify의 잘못된 JSON 1건, 구조 검증 실패 1건). Extract 성공 호출 p90이 19.6초로 제한에 붙어 있고, 최대 출력은 3,021토큰, 생성 속도는 초당 약 150토큰이다. 60초면 약 9,000토큰까지 받을 수 있어 8,192 상한과 맞는다.

**2026-11-19 구현:** 코드를 먼저 고친 뒤 테스트를 썼고, 고치기 전 코드로 되돌려 테스트가 실패하는 것을 확인했다. BE 테스트 248건, Bot 테스트 55건과 타입 검사가 통과했다. 구현 후 내린 결정은 `../spec.md`의 '결정 기록'에 있다.
