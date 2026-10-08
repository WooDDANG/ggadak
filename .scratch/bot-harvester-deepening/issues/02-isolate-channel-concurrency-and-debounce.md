# 02 — Isolate Channel Concurrency & Debounce

**What to build:** Hide all in-flight channel locks (`inFlightChannels`) and debounce timer resets inside the deep engine implementation. Callers no longer manage lock sets or timer IDs.

**Blocked by:** 01 — DecisionHarvestingEngine Interface & In-Memory Fake

**Status:** ready-for-agent

- [ ] In-flight locks managed strictly inside `DecisionHarvestingEngine`
- [ ] Debounce scheduling and cancellation encapsulated per-channel
- [ ] Concurrent triggers on same channel deduplicated or queued safely
- [ ] TDD unit tests verifying lock acquisition/release and debounce behavior
