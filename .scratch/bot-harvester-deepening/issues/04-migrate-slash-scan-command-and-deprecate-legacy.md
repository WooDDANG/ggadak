# 04 — Migrate Slash Scan Command & Deprecate Legacy Surface

**What to build:** Refactor `apps/bot/src/commands/scan.command.ts` to use `engine.harvest({ type: 'SCAN', channel, options })`. Deprecate and privatize all shallow helper methods on `DiscussionHarvester`.

**Blocked by:** 03 — Migrate Message Handler to Engine

**Status:** ready-for-agent

- [ ] `/스캔` slash command calls `engine.harvest({ type: 'SCAN', channel, options })`
- [ ] Remove or privatize leaky helper methods (`extractReactions`, `harvestContextMessages`, etc.)
- [ ] All unit and E2E tests pass 100% green
- [ ] Pass deletion test: deleting the engine proves all complexity was concentrated inside
