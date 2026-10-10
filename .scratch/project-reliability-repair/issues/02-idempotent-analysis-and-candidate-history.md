# 02 — Idempotent Analysis and Candidate History

Type: task
Status: ready-for-agent
Blocked by: 01

## Scope

Implement analysis identity and candidate history from [spec.md](../spec.md). Add durable request claiming/results and payload fingerprints around the production DiscussionService pipeline. Separate delivery identity, canonical evidence, candidate equivalence, and manual reanalysis history.

## Acceptance

- [ ] Same-ID retry returns the stored completion result, including no-decision, without repeated extraction after commit.
- [ ] Same ID with changed payload is rejected; concurrent deliveries cannot create duplicate committed candidates.
- [ ] Candidate persistence and request completion are atomic; abandoned claims are recoverable after a crash.
- [ ] Exact evidence/content reuse preserves reviewer edits and Decision State; partial overlap preserves distinct linked candidates.
- [ ] Original message identities/replies survive preprocessing and are used for evidence identity before burst merging.
- [ ] Manual reanalysis links previous history without resetting confirmed/rejected records; automatic rejected-evidence suppression does not swallow unrelated decisions in the same input window.

## Comments

Implementation authorized by the user invoking implement-spec. Test lost response, concurrent retry, crash recovery, multi-decision evidence, and manual reanalysis through production service seams.
