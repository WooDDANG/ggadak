# AI error logging and dashboard design

Status: implemented for call and application logs, Loki labels, and dashboard panels.

## Current behavior

- Promtail stores AI metrics as Loki streams split by `stage`, `model`, `provider`, and `success`. `error` is a JSON field, not a stored stream label.
- The **Real-time AI Metrics Stream** query uses `| json` and displays all extracted fields as labels. Per-call `timestamp`, `durationMs`, and `error` therefore look like new classifications on each row.
- The latency timeline applies `quantile_over_time` and `avg_over_time` to each stream without an explicit cross-stream aggregation. Repeated legends obscure which provider, stage, or model each line represents.
- AI call records lack a request ID and call ID. The Analysis Request failure log has a request ID but its current category is too broad to explain a specific provider or validation failure.
- Analysis Session input, including messages and transcript, is already persisted in `AnalysisSessionState.inputJson`.

## Target behavior

1. **One event per AI call attempt.** Record `requestId`, `callId`, `provider`, `stage`, `model`, `success`, `durationMs`, token usage when known, and an event timestamp. Count failed attempts even when a later attempt succeeds. Report Analysis Request outcomes in separate panels.
2. **Stable failure grouping.** Add a bounded `failureKind` for timeout, rate limit, provider failure, graph structure validation, semantic verification, and configuration failure. Include `failureStage`, HTTP status when available, and `retryable`. Keep the original error message and bounded provider response in the request's diagnostic record; a short summary and failure code go to Loki.
3. **Bounded stream labels.** Keep `provider`, `stage`, and `success` as AI stream labels. Keep `model`, `requestId`, `callId`, `durationMs`, and error details as JSON fields. Do not create labels from exception messages, model names, IDs, or transcripts.
4. **Readable logs panel.** Stop extracting every JSON field as a displayed label. Show only stable stream dimensions beside each row; expose the full structured call event in expanded details. Allow filtering by `requestId` or `callId` as a log field.
5. **Correct aggregation.** Sum call counts across all matching streams before displaying totals or rates. For latency, use an explicitly named provider/stage breakdown or a mathematically valid cross-stream aggregate. Do not present per-stream averages or percentiles as a single overall value. Label request outcomes and call attempts distinctly.
6. **Raw evidence lookup.** Use `requestId` to retrieve the already persisted discussion input from the backend database. Store bounded, redacted provider error response details with the corresponding attempt in the backend database and link them by `callId`. Do not copy either raw payload into Loki. Restrict raw diagnostic access to authorized operators; keep the same retention policy as the Analysis Request unless a separate policy is introduced.

## Verification for implementation

- The AI logs panel shows a stable set of dimensions for calls with different timestamps, durations, models, and error messages.
- Two calls with different models share a Loki stream when their provider, stage, and success match; model filtering remains available through JSON fields.
- A failed call followed by a successful retry contributes one failed and one successful call, while the request outcome is reported separately.
- A failing call can be traced from its Loki event to its diagnostic record and stored discussion input without exposing raw payloads in Loki.
- Dashboard latency panels have no duplicate anonymous legends and their totals agree with the underlying call events.

## Operator lookup

AI metric log lines carry `requestId`, `callId`, and the upstream `traceId` when one was provided. Search Loki by those JSON fields, then inspect the matching `AnalysisSessionState` row in the backend database. Its `inputJson` contains the original messages and transcript; its `stateJson` contains stage attempts with `callId`, failure kind, original error message, and a redacted provider response of at most 8 KiB. These raw fields are not exposed by the ordinary status API or copied to Loki.

The application log files now use one JSON object per line with ISO timestamp, level, service, environment, and available trace and duration fields. Promtail accepts these lines and older text log lines during transition. AI metrics also include prompt version, token totals when supplied, retry count, repair trigger, validation issue count, and NVIDIA time to first token when available.

Estimated dollar cost is intentionally absent until a model-specific, versioned price table exists. The suggested alert thresholds remain unprovisioned because no notification destination or consecutive Sync Job failure signal is configured; the dashboard exposes slow-call counts and failed channels for inspection.
