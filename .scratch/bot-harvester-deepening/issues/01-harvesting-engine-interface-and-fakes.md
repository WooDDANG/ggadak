# 01 — DecisionHarvestingEngine Interface & In-Memory Fake

**What to build:** Define the single-entrypoint deep module contract `DecisionHarvestingEngine` with `harvest(trigger): Promise<HarvestResult>`, and define internal port `DecisionSink`. Provide an in-memory test harness so callers and tests can drive harvesting without Discord or HTTP network I/O.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Define `DecisionHarvestingEngine` interface with single method `harvest(trigger: HarvestTrigger): Promise<HarvestResult>`
- [x] Define internal port `DecisionSink` for dispatching harvested payloads
- [x] Provide in-memory test harness with mock/fake sink
- [x] Unit tests asserting on observable outcomes through `harvest()`

## Verification

2026-10-13: Existing implementation verified; no runtime changes required. The contract is named `IDecisionHarvestingEngine` in [decision-harvesting-engine.types.ts](../../../apps/bot/src/services/decision-harvesting-engine.types.ts), with an optional shared harvesting policy argument. The implementation accepts an injected `DecisionSink`; [bot.test.ts](../../../apps/bot/src/bot.test.ts) drives `harvest()` with in-memory messages and a fake sink, asserting returned candidates and dispatch counts without Discord or HTTP I/O. Historical test-first ordering was not reverified.

`npm run build --workspace=@ggaddak/bot` and `npm run test --workspace=@ggaddak/bot` passed (31 tests). Dependencies for ticket 02 are now satisfied; its scheduling requirements should be assessed against the existing shared channel scheduler and ADR-0020.
