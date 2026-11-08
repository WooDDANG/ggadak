# AI Observability Labels and Raw Evidence

Status: accepted

AI call metrics count each provider attempt, including attempts that fail before a later retry succeeds. Analysis Request outcomes are a separate measure. Loki stream labels use bounded operational dimensions such as provider, stage, and success; model, request ID, call ID, duration, and error text remain log fields. This keeps model changes and per-call values from fragmenting streams and misleading dashboard aggregates.

The backend database is authoritative for the discussion input already stored with Analysis Sessions and for retained provider error details. Operators correlate a metric or error event with that evidence by request ID and call ID. Provider response details stored for diagnosis have secrets redacted and a size limit. Loki carries stable failure codes, a summary, and correlation IDs; it does not duplicate discussion transcripts or full provider responses. This preserves access to raw evidence without spreading it into the logging system.
