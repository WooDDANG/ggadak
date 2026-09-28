# 04 — Bot LLM Extraction Engine

**What to build:** Implement decision extraction in `apps/bot` using Vercel AI SDK (`ai` + `zod`) to extract structured `Topic`, `Decision`, `Rationale`, and `Action Items` from the `Discussion Context`.

**Blocked by:** 01 — Shared Domain Schemas, 03 — Bot Gateway Ingestion and Context Builder

**Status:** resolved

- [x] Create system prompts instructing the LLM on Decision, Rationale, and Action Item extraction
- [x] Use `generateObject` with Zod schema from `@ggaddak/shared`
- [x] Handle error states when no decision is found or LLM fails
- [x] Add unit tests with mock LLM responses
