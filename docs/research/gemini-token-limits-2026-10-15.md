# Gemini API token limits

Verified against official Google documentation on 2026-10-15. No account credentials or project-specific quota values were inspected for this research.

## Per-request model limits

Google currently documents separate **1,048,576 input tokens** and **65,536 output tokens** for Gemini 3 and 2.5 models, including the current `gemini-3.8-flash` family. These are model limits, not free-tier allowances. Gemini 4 uses a shared window instead, so changing model families can change budget semantics. [Token/context guide](https://ai.google.dev/gemini-api/docs/generate-content/tokens#context-windows)

Retrieve the configured model's current metadata with `GET https://generativelanguage.googleapis.com/v1beta/models/{model}`. The response exposes `inputTokenLimit`, `outputTokenLimit`, and `supportedGenerationMethods`; use these rather than assuming all models have the same limits. [Models REST reference](https://ai.google.dev/api/models)

## Request counting

`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens` returns non-negative `totalTokens`. A request can provide either `contents` or `generateContentRequest`, never both. The latter represents the whole generation input, including system instructions and function declarations. [Token counting REST reference](https://ai.google.dev/api/tokens)

Example body for the full-request variant (the outer endpoint already names the model):

```json
{
  "generateContentRequest": {
    "model": "models/gemini-3.8-flash",
    "contents": [{ "role": "user", "parts": [{ "text": "한국어 대화" }] }],
    "systemInstruction": { "parts": [{ "text": "결정과 근거를 추출하세요." }] },
    "generationConfig": {
      "maxOutputTokens": 8192,
      "responseMimeType": "application/json"
    }
  }
}
```

Implementation recommendation: reuse the actual generation body, including the provider-compatible response schema, rather than counting only the transcript. The reference does not explicitly promise separate accounting for JSON response schemas; retain the final `usageMetadata` as actual inference accounting and avoid claiming perfect identity between preflight and generation counts. Google itself illustrates slightly different preflight and actual prompt counts. [Token counting reference](https://ai.google.dev/api/tokens), [Generation request reference](https://ai.google.dev/api/generate-content)

Character lengths are not exact token counts. Google's approximate character/word examples concern typical text and English words; Korean text and structured prompts must be counted with the configured model's tokenizer. [Token guide](https://ai.google.dev/gemini-api/docs/generate-content/tokens)

Billing FAQ names `GetTokens` as unbilled and outside inference quotas, but does not explicitly map that name to REST `models.countTokens`; this note does not assume that equivalence. A `countTokens.totalTokens` result describes a prospective prompt, not generated-token usage, so application generation-usage totals must not add it as consumed inference. An application cap on all HTTP requests may still include these preflight operations. [Billing FAQ](https://ai.google.dev/gemini-api/docs/billing), [Count response semantics](https://ai.google.dev/api/tokens)

## Paid project quotas

Paid service retains RPM, input TPM, and RPD limits. They apply per project, not per key; daily request quotas reset at midnight Pacific time. Actual values depend on model, usage tier, and account status and must be read in AI Studio. Paid status alone supplies no defensible numeric quota or unlimited-input guarantee. The documented spend limits can also produce `429 RESOURCE_EXHAUSTED`. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

Application recommendations (design choices, not Google requirements):

- Preflight each Gemini request against model input capacity and an optional application token budget. Do not encode free-tier quota numbers as model limits.
- Keep an explicit output cap at or below model metadata; a response-sized cap limits latency and cost even when the model allows more.
- Reject excessive input explicitly, or partition at conversation boundaries; do not silently truncate evidence.
- Treat character/request-size caps as separate application safeguards with explicit configuration and purpose.
- Keep multi-step workflow total-token budgets separate from a single call's context limit; extraction, validation, and repair consume separate requests.
- Handle quota failures through bounded retry/queue policy. A local limiter cannot know traffic from other processes or services sharing the project.

## Applied to the BE service

- Gemini now reads input/output limits from models.get (cached per Adapter/model) and counts the full generation request before extraction, verification, repair, or evaluation baseline generation. Each preflight uses the same deadline/cancellation signal as the generation attempt.
- Gemini's default model is gemini-3.8-flash. Its application character cap defaults to 0 (disabled). The existing configured deployment's root AI_MAX_INPUT_CHARS was set to 0. Existing saved workflows preserve their saved character caps.
- Optional AI_MAX_INPUT_TOKENS sets a stricter application cap; input must satisfy both that cap and model capacity. Without it, model metadata supplies the input cap. Input is rejected explicitly, never silently truncated.
- AI_MAX_OUTPUT_TOKENS keeps its response-sized default of 8192 and can be raised explicitly up to the model output capacity. Provider model maxima are distinct from application cost/latency choices.
- OpenAI's previous default character cap remains when no explicit character override is supplied. Gemini preflight was not added to OpenAI or mock adapters.
- Live evaluation accepts --max-input-chars 0. Its HTTP cap includes metadata and count requests, but consumed generation tokens come from response usage rather than prospective counts.
- Gemini 4's combined-window policy is not verified by this separate-capacity implementation. Current production model is Gemini 3.8 Flash.

Verification: regression reproduced rejection of >100000 characters despite valid token size before the change. Transport tests now cover large Korean input, full request counting, model/app boundaries, cached metadata, excessive output, quota failure, and evaluation accounting. npm test passed all workspaces (BE 96 tests, E2E 6); typecheck, lint (one existing logger warning), changed-file formatting and Standards/Spec review passed.

Real gemini-3.8-flash smoke succeeded with character cap 0: metadata 1 + countTokens 2 + generation 2 = 5 HTTP calls, consumption 2153 tokens. Graph structure and semantic verdict passed. Report: ignored `.data/evaluation/live-token-preflight-2026-10-15.json`. This is connectivity verification, not a service quality or high-volume quota evaluation. No production database was touched.
