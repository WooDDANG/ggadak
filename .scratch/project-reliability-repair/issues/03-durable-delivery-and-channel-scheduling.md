# 03 — Durable Delivery and Channel Scheduling

Type: task
Status: ready-for-agent
Blocked by: 02

## Scope

Implement the durable delivery section of [spec.md](../spec.md). Add Bot-local persistent analysis delivery and one scheduler shared by startup, events, reactions and slash commands. Replace dual locks and dropped triggers, and make production AI/configuration failures explicit.

## Acceptance

- [ ] Queue identity and pending/retry/failed state survive Bot restart and BE outage.
- [ ] One analysis executes per channel; later work remains eligible while earlier retries wait.
- [ ] Manual triggers bypass debounce without bypassing serialization; all coalesced/canceled callers settle.
- [ ] Completed-no-decision, queued, transient failure and retained failure are distinct outcomes.
- [ ] Retry count, jitter/backoff, request timeout and permanent error classification are configurable and bounded.
- [ ] Production AI failures do not produce heuristic candidates; tests/development have explicit fallback mode and configurable provider/model.
- [ ] Queue status synchronizes to BE when reachable and accepts idempotent Web retry commands; disconnects report stale/unavailable status.

## Comments

Implementation authorized by the user invoking implement-spec. Test scheduler through all entrypoints, including commands that currently construct new engine instances. Use fake AI/network seams; no external AI calls.
