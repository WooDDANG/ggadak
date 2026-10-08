# 03 — Migrate Message Handler to Engine

**What to build:** Refactor `apps/bot/src/handlers/message.handler.ts` to delegate all harvesting logic to `engine.harvest({ type: 'EVENT', message })`, shrinking the handler to a minimal thin entrypoint.

**Blocked by:** 02 — Isolate Channel Concurrency & Debounce

**Status:** ready-for-agent

- [ ] `message.handler.ts` delegates event harvesting via `engine.harvest({ type: 'EVENT', message })`
- [ ] Reaction adding (📝) and feedback triggers executed as part of harvest pipeline
- [ ] End-to-end bot test verification
