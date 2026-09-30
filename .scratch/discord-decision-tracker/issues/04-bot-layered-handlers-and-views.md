# 04 — Bot & Web Dashboard Alignment with TSOA Endpoints

**What to build:**
Verify and ensure complete compatibility of the Discord Bot (`BackendApiService`) and Web Dashboard Review Queue with the auto-generated TSOA endpoints, rate limits, and security headers.

**Blocked by:**
03 — TSOA Decorator-Driven Controllers & Swagger UI Generation

**Status:** ready-for-agent

- [ ] `BackendApiService` verified against `/api/discussions/analyze`, `/api/feedbacks`, `/api/decisions`, and `/api/config/policy`.
- [ ] Discord slash commands (`/피드백입력`, `/스캔`) and 📌 override verified with TSOA routes.
- [ ] Web Dashboard Review Queue actions (Confirm, Defer, Reject) verified.
