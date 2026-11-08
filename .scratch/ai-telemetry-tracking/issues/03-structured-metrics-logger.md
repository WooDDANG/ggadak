# 03: Structured Metrics Logger Transport

Type: task
Status: ready-for-agent
Blocked by: 01: Per-Call Latency and Token Telemetry in AiAdapter

## Question
How should the backend Winston logger be configured to route telemetry events into a dedicated `apps/be/logs/ai-metrics.log` JSON-lines file alongside standard console output without impacting request latency?
