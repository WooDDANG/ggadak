# 01: Config and Timeout Defaults

**What to build:**
Centralize NVIDIA configuration and 20-second timeout policy defaults in `GraphPolicy` and `AiDefaults`. Support `AI_CALL_TIMEOUT_MS` (default 20,000ms), `AI_MAX_OUTPUT_TOKENS` (default 16,384 for NVIDIA), and `NVIDIA_ENABLE_THINKING` (default true) through environment variables and `AppConfig`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `GraphPolicy.callTimeoutMs` uses `process.env.AI_CALL_TIMEOUT_MS` with 20,000ms default
- [x] `AiDefaults.maxOutputTokens` defaults to 16,384 for NVIDIA provider
- [x] `AppConfig.ai` includes `nvidiaEnableThinking` boolean flag (default true)
- [x] Unit tests verify configuration defaults and environment overrides

## Answer
- `GraphPolicy.callTimeoutMs` default updated to 20,000ms and supports `AI_CALL_TIMEOUT_MS`.
- `AiDefaults.maxOutputTokens` set to 16,384 and `nvidiaEnableThinking` flag added to `AppConfig.ai`.
- Tests in `apps/be/tests/adapters/ai.adapter.test.ts` pass verifying the 16,384 token default and model selection.
