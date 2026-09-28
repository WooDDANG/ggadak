# 06 — Bot Reliable Webhook Egress

**What to build:** Implement SQLite persistent egress queue in `apps/bot` and HTTP client that transmits validated `DecisionPayload` to Backend `POST /api/webhooks/decisions` with exponential backoff and retries.

**Blocked by:** 02 — BE Webhook Ingestion and Storage, 05 — Bot Interactive Conflict Resolution

**Status:** resolved

- [x] Create local SQLite `egress_queue` table in `apps/bot`
- [x] Enqueue confirmed decisions upon resolution
- [x] Implement background dispatcher worker with backoff retry
- [x] Add integration tests verifying at-least-once delivery during simulated downtime
