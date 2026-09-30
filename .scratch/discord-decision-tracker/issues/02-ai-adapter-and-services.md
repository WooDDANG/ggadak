# 02 — AI Adapter & Domain Service Layer

**What to build:**
Isolate external AI providers (Google Gemini, OpenAI, Mock) behind a dedicated `AiAdapter` abstraction in `adapters/` and organize business logic cleanly into dedicated services (`DecisionService`, `DiscussionService`, `FeedbackService`, `CheckpointService`, `PolicyService`).

**Blocked by:**
01 — NASA-Style Backend Foundation (Loaders, Config & Error Handling)

**Status:** ready-for-agent

- [ ] `AiAdapter` interface and implementation supporting Gemini 1.5 Flash, OpenAI GPT-4o-mini, and deterministic Mock extraction.
- [ ] `DiscussionService` utilizing `AiAdapter`, SHA-256 evidence hashing, and anti-recreation verification.
- [ ] `DecisionService` managing state transitions (`Draft`, `Decided`, `Deferred`, `Rejected`, `Superseded`).
- [ ] `FeedbackService` and `CheckpointService` handling external feedback context and channel watermarks.
- [ ] Dependency injection of repository and AI adapter into services during loader initialization.
