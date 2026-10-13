# 04 — Migrate Slash Scan Command & Deprecate Legacy Surface

**What to build:** Refactor `apps/bot/src/commands/scan.command.ts` to use `engine.harvest({ type: 'SCAN', channel, options })`. Deprecate and privatize all shallow helper methods on `DiscussionHarvester`.

**Blocked by:** 03 — Migrate Message Handler to Engine

**Status:** claimed

- [x] `/스캔` slash command calls `engine.harvest({ type: 'SCAN', channel, options })`
- [x] Remove or privatize leaky helper methods (`extractReactions`, `harvestContextMessages`, etc.)
- [ ] All unit and E2E tests pass 100% green
- [x] Pass deletion test: deleting the engine proves all complexity was concentrated inside

## Implementation and verification

The slash command already delegates both channel and server scopes to `engine.harvest()` using the established `SCAN.target` contract and preserves full/hours/limit options, result counts, and incomplete-scan replies. No command behavior change was required.

`harvestContextMessages` is now private, as `extractReactions` already was. Removed the unused `executeAnalysis` alias. Live orchestration and reaction adapter operations carry `@internal` annotations: the engine needs process/scan operations, while startup scans and durable completion reconciliation still use the harvester adapter. These cross-object adapter methods remain callable; privatizing them would break those live callers. Context-window, concurrent EVENT, bounded SCAN, and paginated SCAN regression tests now assert through `harvest()` rather than collection/orchestration helpers.

Deletion test: temporarily replaced the engine's `harvest()` implementation with a thrown deletion error, rebuilt, and ran bot and scan-coverage seam suites. Six of eleven tests failed, including asymmetric context, concurrent EVENT, debounce, bounded SCAN, and paginated SCAN. After restoring the engine, bot build and all 33 bot tests passed. This confirms the user-facing trigger pipeline depends on the engine. Discord collection remains delegated to the harvester adapter, and durable delivery scheduling stays in BackendApiService under ADR-0020; the deletion test does not claim those delegated responsibilities physically live inside the engine file. This was a behavior-preserving refactor, so no new feature RED cycle was claimed.

The integration coordinator will run repository-wide unit and E2E checks before resolving this ticket.
