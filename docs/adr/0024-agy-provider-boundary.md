# AGY as the sole BE analysis provider

Status: accepted, supersedes [ADR-0022](0022-explicit-provider-http-for-bounded-analysis.md) for BE generation-provider selection. BE Decision analysis uses the cached-login AGY CLI behind `AgyProvider`; `AiAdapter` owns workflow stages and common validation. Keeping one active generation path avoids maintaining unused HTTP request, schema-conversion and credential flows while preserving an `AiProvider` seam for a future explicitly approved provider. OpenAI embeddings remain independent.
