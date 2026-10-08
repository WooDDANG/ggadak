# 01 — DecisionHarvestingEngine Interface & In-Memory Fake

**What to build:** Define the single-entrypoint deep module contract `DecisionHarvestingEngine` with `harvest(trigger): Promise<HarvestResult>`, and define internal port `DecisionSink`. Provide an in-memory test harness so callers and tests can drive harvesting without Discord or HTTP network I/O.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Define `DecisionHarvestingEngine` interface with single method `harvest(trigger: HarvestTrigger): Promise<HarvestResult>`
- [ ] Define internal port `DecisionSink` for dispatching harvested payloads
- [ ] Provide in-memory test harness with mock/fake sink
- [ ] TDD unit tests asserting on observable outcomes through `harvest()`
