# 08 — Regression Verification and API Contracts

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07

## Scope

Complete the verification section of [spec.md](../spec.md). Individual tickets add their behavioral checks during implementation; this ticket joins them into the normal test entrypoint and verifies the complete runtime path.

## Acceptance

- [x] Normal test command includes root-level BE API tests currently omitted by its shell glob.
- [x] E2E injects deterministic AI through the production adapter interface rather than the legacy hardcoded extraction engine.
- [x] Tests isolate persistent databases and prevent external AI calls/live-file mutation.
- [x] Cover restart, failed writes, response-loss retry, out-of-order scan completion, crash recovery, semantic admission, debounce cancellation, stale review and atomic task transfer.
- [x] Validate incoming DTOs, including Decision ingestion, so malformed payloads cannot poison later reads; regenerate TSOA/Orval artifacts after contract changes.
- [x] Build, full tests, lint and touched-file format checks pass; unrelated repository formatting drift is reported without wholesale changes.
- [x] Record any remaining operational migration/model configuration steps separately; do not deploy or change live data as part of verification.

## Comments

Implementation authorized by the user invoking implement-spec. The acceptance evidence must describe actual behavior verified, not merely test counts.

## Answer

Completed the normal regression entrypoint across all reliability work. Vitest includes root-level BE HTTP tests; Bot tests include root-level engine tests. E2E uses injected deterministic IAiAdapter implementations through production DiscussionService/HTTP routes. Test setup selects explicit mock configuration, rejects external-network calls and disables default workspace-database fallback; repositories/migrations use isolated fixtures. Discussion validation rejects malformed IDs, dates and reaction counts before persistent claims, and Decision ingestion validates before storage. Regenerated TSOA and Orval contracts for policy, history, queue/ranges and retry acceptance.

Verified persistence/restart, failed writes, response-loss replay, fenced claims/crash recovery, partial range completion, failed checkpoint reads/acknowledgements, semantic admission, merged/canceled callers, reaction ownership, stale review and atomic task transfer. Added a connected E2E from retained Bot delivery through Web retry, Bot acknowledgement, real HTTP analysis, final result replay and scan checkpoint recovery, with one deterministic AI invocation.

Final verification: `npm test` passes 133 tests (Shared 15, BE 74, Bot 31, FE 10, E2E 3), including the workspace build. `npm run typecheck`, `npm run lint`, touched-file Prettier check and `git diff --check` pass; lint retains only the existing unused import warning in `packages/shared/src/logger.test.ts`. Operational migrations/configuration are documented separately; only test databases were migrated.
