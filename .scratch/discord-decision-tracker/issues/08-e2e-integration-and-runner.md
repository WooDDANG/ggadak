# 08 — E2E Integration and Unified Runner

**What to build:** Provide unified root runner scripts (`pnpm dev`, `pnpm build`, `pnpm test`) and an E2E simulation harness that exercises the complete flow from Discord event ➔ LLM parsing ➔ Conflict resolution ➔ Backend ingestion ➔ Frontend timeline display.

**Blocked by:** 06 — Bot Reliable Webhook Egress, 07 — FE Decision Timeline Dashboard

**Status:** resolved

- [x] Configure root `package.json` scripts with concurrent/filter execution
- [x] Create `.env.example` with clear documentation for Discord token, LLM keys, and Webhook URLs
- [x] Implement an automated E2E integration test exercising the full pipeline
- [x] Validate full test suite passes with `npm test`
