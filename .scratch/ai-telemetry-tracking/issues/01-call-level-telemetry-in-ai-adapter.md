# 01: Per-Call Latency and Token Telemetry in AiAdapter

Type: task
Status: ready-for-agent
Blocked by: None

## Question
How should `AiAdapter` measure per-call execution latency using `performance.now()`, capture token usage, and emit call-level telemetry metrics (`stage`, `model`, `durationMs`, `inputTokens`, `outputTokens`, `success`, `error`) across all workflow stages?
