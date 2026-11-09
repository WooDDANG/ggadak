# 01: AI Metrics Structured Logging

**What to build:**
Capture execution duration (`performance.now()`), token usage, stage, model, provider, and success/error status inside `AiAdapter` and write standardized JSON-lines records to `apps/be/logs/ai-metrics.log`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Measure call latency with high resolution timing in `AiAdapter.call`
- [x] Record structured telemetry to `apps/be/logs/ai-metrics.log` on both success and failure
- [x] Unit tests verify telemetry fields and timing capture

## Answer
- Implemented `recordAiMetric` in `apps/be/src/adapters/ai-metrics-logger.ts` recording JSON-lines to `apps/be/logs/ai-metrics.log` and pretty console summaries.
- Integrated timing via `performance.now()` in `AiAdapter.call` capturing `durationMs`, `stage`, `model`, `provider`, and token metrics for successes and failures.
- All unit tests in `apps/be/tests/adapters/ai-metrics-logger.test.ts` and `ai.adapter.test.ts` pass.
