# 02 — Isolate Channel Concurrency & Debounce

**What to build:** Hide all in-flight channel locks (`inFlightChannels`) and debounce timer resets inside the deep engine implementation. Callers no longer manage lock sets or timer IDs.

**Blocked by:** 01 — DecisionHarvestingEngine Interface & In-Memory Fake

**Status:** resolved

- [x] Channel execution ownership hidden from callers (shared scheduler per ADR-0020)
- [x] Debounce scheduling and cancellation encapsulated per-channel
- [x] Concurrent triggers on same channel deduplicated or queued safely
- [x] TDD unit tests verifying lock acquisition/release and debounce behavior

## Answer

2026-10-13: Debounce timers and cancellation are encapsulated by `DecisionHarvestingEngine`; replacement settles superseded callers with `merged`, cancellation settles with `canceled`, and manual triggers bypass debounce while waiting for channel execution. Existing public-interface tests cover these behaviors and serialization across startup scans, events, reactions, commands, and restart recovery.

ADR-0020 supersedes the literal engine-local lock requirement: production delivery owns a shared process-wide channel scheduler so scans and retries share execution slots, while retries release slots during backoff. Moving that lock into each engine would permit overlapping analysis across engines and delivery retries. Callers manage neither lock sets nor timer IDs. Standalone engines also share a scheduler across instances.

A new test at the approved `harvest()` seam first failed because a standalone manual sink failure escaped as a rejected promise. The engine now awaits scheduled standalone execution inside its existing error handler, returning `retained-failure` while allowing queued same-channel work to complete. This preserves `AnalysisDeliveryError` outcomes through the same handler.

Validation: `npm run build --workspace=@ggaddak/bot` and `npm test --workspace=@ggaddak/bot` passed (32 tests). The new failure-result/channel-release test was observed red before the fix. Existing debounce and shared-production-scheduler tests remained green.
