# 02: NvidiaProvider Reasoning Logging and Timeout Error Classification

**What to build:**
Enhance `NvidiaProvider` to log `reasoning_content` to the backend debug logger, respect the `NVIDIA_ENABLE_THINKING` toggle, and classify timeout aborts as `503 Service Unavailable`.

**Blocked by:** 01: Config and Timeout Defaults

**Status:** resolved

- [x] `NvidiaProvider` passes `chat_template_kwargs: { enable_thinking: true }` only when thinking is enabled
- [x] `reasoning_content` chunks are logged using backend logger at debug level
- [x] Timeout aborts are mapped to `AppError` with status code 503 instead of uncaught AbortError
- [x] Unit tests verify reasoning logging, thinking toggle, and timeout error classification

## Answer
- `NvidiaProvider` now supports `enableThinking` option (reading from `config.ai.nvidiaEnableThinking` or passed explicitly).
- `reasoning_content` chunks log directly to logger debug level with `[NVIDIA Thinking]` prefix.
- Timeout/abort errors are mapped to 503 `AI call timed out after configured deadline`.
- Full tests pass in `apps/be/tests/adapters/nvidia-provider.test.ts`.
