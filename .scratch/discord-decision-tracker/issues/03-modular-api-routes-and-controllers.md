# 03 — Modular Express Controllers & Sub-Routers

**What to build:**
Implement modular Express controllers under `api/controllers/` and sub-routers under `api/routes/`, mapping incoming HTTP requests to domain services with Zod DTO schema validation and typed JSON responses.

**Blocked by:**
02 — Explicit DTOs, Database Models, Mappers & AI Adapter

**Status:** ready-for-agent

- [ ] `DecisionController` and `decision.routes.ts` (`GET /api/decisions`, `POST /api/webhooks/decisions`, `POST /api/decisions/:id/review`, `POST /api/decisions/resolve-conflict`).
- [ ] `DiscussionController` and `discussion.routes.ts` (`POST /api/discussions/analyze`).
- [ ] `FeedbackController` and `feedback.routes.ts` (`GET & POST /api/feedbacks`).
- [ ] `CheckpointController` and `checkpoint.routes.ts` (`GET & POST /api/channels/:channelId/checkpoint`).
- [ ] `PolicyController` and `policy.routes.ts` (`GET /api/config/policy`).
- [ ] `api/routes/index.ts` consolidating sub-routers under `/api` path prefix.
