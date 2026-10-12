# 02 — Idempotent Analysis and Candidate History

Type: task
Status: resolved
Blocked by: 01

## Scope

Implement analysis identity and candidate history from [spec.md](../spec.md). Add durable request claiming/results and payload fingerprints around the production DiscussionService pipeline. Separate delivery identity, canonical evidence, candidate equivalence, and manual reanalysis history.

## Acceptance

- [x] Same-ID retry returns the stored completion result, including no-decision, without repeated extraction after commit.
- [x] Same ID with changed payload is rejected; concurrent deliveries cannot create duplicate committed candidates.
- [x] Candidate persistence and request completion are atomic; abandoned claims are recoverable after a crash.
- [x] Exact evidence/content reuse preserves reviewer edits and Decision State; partial overlap preserves distinct linked candidates.
- [x] Original message identities/replies survive preprocessing and are used for evidence identity before burst merging.
- [x] Manual reanalysis links previous history without resetting confirmed/rejected records; automatic rejected-evidence suppression does not swallow unrelated decisions in the same input window.

## Comments

Implementation authorized by the user invoking implement-spec. Test lost response, concurrent retry, crash recovery, multi-decision evidence, and manual reanalysis through production service seams.

## Answer

Implemented durable request claims with lease renewal and owner fencing, changed-payload conflict, atomic completion/candidate persistence and stored replay (including no-decision). Candidate identity retains original preprocessed messages/replies, ignores delivery reactions, reuses exact guild/evidence/content candidates without overwriting review state, and records manual/related analysis history via `GET /api/discussions/history/{decisionId}`. Legacy rejected scopes remain effective while unrelated content survives. BE analysis no longer advances scan checkpoints or infers conflict/Pivot from Topic matches.

Validation: production DiscussionService tests with deterministic AI and isolated migrated SQLite verify restart replay, concurrent retry, stale-owner recovery, late-session failure, DB rollback, exact edited/rejected reuse, overlap links, original burst replies and scoped legacy rejection; 9 analysis tests + 3 repository tests passed. Build, touched-source ESLint, Prettier and diff whitespace checks passed. Required requestId is coordinated with ticket03 and regression caller updates08.
