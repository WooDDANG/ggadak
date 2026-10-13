# 03 — Migrate Message Handler to Engine

**What to build:** Refactor `apps/bot/src/handlers/message.handler.ts` to delegate all harvesting logic to `engine.harvest({ type: 'EVENT', message })`, shrinking the handler to a minimal thin entrypoint.

**Blocked by:** 02 — Isolate Channel Concurrency & Debounce

**Status:** resolved

- [x] `message.handler.ts` delegates event harvesting via `engine.harvest({ type: 'EVENT', message })`
- [x] Reaction adding (📝) and feedback triggers executed as part of harvest pipeline
- [x] End-to-end bot test verification

## Answer

2026-10-13: MessageHandler delegates admitted events to `engine.harvest({ type: 'EVENT', message })`; monitoring, bot-author, keyword and semantic admission gates remain intact. Removed its unused reaction callback and updated production/test wiring so reaction responsibilities stay in the harvest pipeline.

ADR-0019 interprets feedback as reaction-only processing/result feedback (👀/📝); automatic channel feedback messages are intentionally excluded. A public-message integration test runs the real engine, harvester and delivery service against external HTTP/Discord fixtures, proving both keyword and semantic-only admission, rejection of unmonitored/bot/casual messages, and pipeline-owned processing/result reactions without channel messages.

Validation: the new constructor contract initially failed compilation against the obsolete callback signature; after removal, Bot build and all 33 Bot tests passed. The semantic-only fixture was verified to bypass CONSENSUS_REGEX and the focused integration test passed after fixture refinement. Scoped ESLint and Prettier checks passed.
