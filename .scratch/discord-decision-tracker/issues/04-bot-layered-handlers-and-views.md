# 04 — Bot & Web Dashboard Alignment with TSOA Endpoints

**What to build:**
Verify and ensure complete compatibility of the Discord Bot (`BackendApiService`) and Web Dashboard Review Queue with the auto-generated TSOA endpoints, rate limits, and security headers.

**Blocked by:**
03 — TSOA Decorator-Driven Controllers & Swagger UI Generation

**Status:** resolved

- [ ] `BackendApiService` verified against `/api/discussions/analyze`, `/api/feedbacks`, `/api/decisions`, and `/api/config/policy`.
- [ ] Discord slash commands (`/피드백입력`, `/스캔`) and 📌 override verified with TSOA routes.
- [ ] Web Dashboard Review Queue actions (Confirm, Defer, Reject) verified.

## Comments

2026-10-14: 후속 v1/reliability 작업에서 Bot API와 Web Review Queue 연결 및 검증 완료. 이전 경로 대신 현재 API 계약을 따른다. [대조 기록](../../ticket-audit-2026-10-14.md).
