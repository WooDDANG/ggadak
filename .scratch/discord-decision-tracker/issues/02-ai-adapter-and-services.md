# 02 — Explicit DTOs, Database Models, Mappers & AI Adapter

**What to build:**
Implement explicit DTO interfaces/schemas, database entity models, bidirectional mappers, and an isolated `AiAdapter` abstraction in `adapters/` supporting Google Gemini 1.5 Flash, OpenAI GPT-4o-mini, and deterministic Mock fallback.

**Blocked by:**
01 — NASA-Style Backend Foundation, Security (Helmet/Rate-Limit) & Structured Logging (Winston)

**Status:** ready-for-agent

- [ ] Explicit `dto/` definitions (`decision.dto.ts`, `discussion.dto.ts`, `feedback.dto.ts`, `checkpoint.dto.ts`, `policy.dto.ts`).
- [ ] Explicit `models/` database entity models (`decision.entity.ts`, `feedback.entity.ts`, `checkpoint.entity.ts`, `rejected-evidence.entity.ts`).
- [ ] `mappers/` for bidirectional conversion between DB Rows, Domain Entities, and API DTOs.
- [ ] `adapters/ai.adapter.ts` wrapping Gemini, OpenAI, and Mock providers behind a unified AI interface.
- [ ] `DiscussionService`, `DecisionService`, `FeedbackService`, and `CheckpointService` refactored to use DTOs and Mappers.
