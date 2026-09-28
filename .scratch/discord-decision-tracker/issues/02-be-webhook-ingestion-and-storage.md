# 02 — BE Webhook Ingestion and Storage

**What to build:** Implement the backend REST API server (`apps/be`) with an endpoint `POST /api/webhooks/decisions` to ingest and validate `DecisionPayload` objects, store them in SQLite, and provide `GET /api/decisions` for timeline queries.

**Blocked by:** 01 — Shared Domain Schemas

**Status:** resolved

- [x] Create Fastify/Express HTTP server in `apps/be`
- [x] Implement `POST /api/webhooks/decisions` with Zod validation
- [x] Create SQLite database migrations/tables for decisions and action items
- [x] Implement `GET /api/decisions` with filtering by topic, channel, and state
- [x] Add integration tests for ingestion and query endpoints
