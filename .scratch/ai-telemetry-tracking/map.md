# Map: AI Execution Duration and Call Count Telemetry

Status: open
Label: wayfinder:map

## Destination
Standardized AI execution telemetry & structured metrics logging (`apps/be/logs/ai-metrics.log` and console debug) capturing per-call latency, token usage, stage, model, and aggregate session metrics across `AiAdapter` and `GraphWorkflow` without requiring database schema changes.

## Notes
- Domain: Backend AI extraction pipeline (`apps/be/src/adapters/ai.adapter.ts`, `apps/be/src/services/graph-workflow.ts`)
- Target: NVIDIA NIM & AGY execution observability
- Logging: Winston structured JSON transport isolation under `apps/be/logs/`
- Standing preference: Low overhead, non-intrusive timing measurement using `performance.now()`, explicit failure propagation

## Decisions so far
<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

## Not yet specified
<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
- Log rotation and retention policy for `ai-metrics.log`
- Alerting threshold triggers for anomalous call durations (> 18s nearing the 20s timeout)

## Out of scope
<!-- work ruled beyond the destination; closed, never graduates -->
- Database schema migrations or permanent `AiCallLog` persistence
- Frontend real-time telemetry dashboard or telemetry export APIs (Prometheus/OpenTelemetry)
