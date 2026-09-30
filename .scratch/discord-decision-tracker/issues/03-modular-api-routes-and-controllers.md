# 03 — Modular API Routes & Express Controllers

**What to build:**
Implement modular Express routing and controllers under `api/routes/` and `api/controllers/`, cleanly mapping incoming HTTP requests to domain services with Zod schema validation and standard JSON responses.

**Blocked by:**
02 — AI Adapter & Domain Service Layer

**Status:** ready-for-agent

- [ ] `DecisionController` and `decision.routes.ts` (`GET /api/decisions`, `POST /api/webhooks/decisions`, `POST /api/decisions/:id/review`, `POST /api/decisions/resolve-conflict`).
- [ ] `DiscussionController` and `discussion.routes.ts` (`POST /api/discussions/analyze`).
- [ ] `FeedbackController` and `feedback.routes.ts` (`GET & POST /api/feedbacks`).
- [ ] `CheckpointController` and `checkpoint.routes.ts` (`GET & POST /api/channels/:channelId/checkpoint`).
- [ ] `PolicyController` and `policy.routes.ts` (`GET /api/config/policy`).
- [ ] `api/routes/index.ts` consolidating all sub-routers under a unified Express Router.
