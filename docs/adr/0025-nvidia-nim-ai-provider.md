# NVIDIA NIM as primary BE analysis provider

Status: accepted, supersedes [ADR-0024](0024-agy-provider-boundary.md) for BE generation-provider selection.

## Context

GGADDAK previously used an Antigravity CLI (`agy`) subprocess as its sole generation provider. While the CLI provided an isolated session boundary with cached local login, deployment environments and automated CI/CD pipelines require direct HTTP access using standard API keys and OpenAI-compatible SDK semantics without an external interactive CLI daemon. Furthermore, advanced reasoning models such as Nemotron 120B offer chain-of-thought capabilities for complex discussion graph extraction and criticism.

## Decision

1. **Primary Provider**: BE decision analysis selects NVIDIA NIM (`https://integrate.api.nvidia.com/v1`) via the official `openai` SDK inside `NvidiaProvider`, conforming to the established `AiProvider` interface.
2. **Dual Provider Coexistence**: Both `nvidia` (default) and `agy` remain supported through the `AI_PROVIDER` configuration. No implicit runtime fallback between providers is allowed.
3. **Model Selection**: The default model across all three workflow stages (`Extract`, `Verify`, `Repair`) is unified to `nvidia/nemotron-3.5-super-vl-120b-a12b`, with stage overrides (`AI_MODEL_EXTRACT`, `AI_MODEL_VERIFY`, `AI_MODEL_REPAIR`) remaining supported.
4. **Token Limits & Timeout**:
   - `AI_MAX_OUTPUT_TOKENS` defaults to 8,192. Measured output peaked near 3,000 tokens at roughly 150 tokens per second with thinking disabled; raise it explicitly when enabling thinking.
   - `AI_CALL_TIMEOUT_MS` defaults to 60,000ms so that the default output limit can complete before the call deadline. The 20-second default cut off a quarter of measured calls.
   - Timeout aborts carry the `timeout` failure code. Inside a Scan Range they skip only the affected session ([ADR-0028](0028-degraded-analysis-and-scan-progress.md)); elsewhere the durable queue retries the request without pausing the whole queue. Hidden retries with thinking disabled are explicitly rejected.
5. **Thinking & Logging**:
   - `NVIDIA_ENABLE_THINKING` (default `true`) passes `chat_template_kwargs: { enable_thinking: true }`.
   - Streaming `reasoning_content` is consumed without writing it to backend logs. The raw-evidence logging boundary is defined in [ADR-0027](0027-ai-observability-labels-and-raw-evidence.md).
6. **Schema Enforcement & Scope**:
   - Model outputs are normalized through `extractAndParseJson` to handle markdown code fences. Graph schema violations delegate directly to the domain agentic workflow (`repairGraph`) rather than an opaque adapter retry. Responses that are empty, unparseable, truncated at the output limit, or Verify responses that violate their schema are output format failures, not graph defects; they are not repaired and follow the session failure rules of ADR-0028.
   - Multimodal image processing of Discord attachments is deferred to a separate milestone; text transcripts remain the primary input boundary.
