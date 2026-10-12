# 08 — Regression Verification and API Contracts

Type: task
Status: ready-for-agent
Blocked by: 01, 02, 03, 04, 05, 06, 07

## Scope

Complete the verification section of [spec.md](../spec.md). Individual tickets add their behavioral checks during implementation; this ticket joins them into the normal test entrypoint and verifies the complete runtime path.

## Acceptance

- [ ] Normal test command includes root-level BE API tests currently omitted by its shell glob.
- [ ] E2E injects deterministic AI through the production adapter interface rather than the legacy hardcoded extraction engine.
- [ ] Tests isolate persistent databases and prevent external AI calls/live-file mutation.
- [ ] Cover restart, failed writes, response-loss retry, out-of-order scan completion, crash recovery, semantic admission, debounce cancellation, stale review and atomic task transfer.
- [ ] Validate incoming DTOs, including Decision ingestion, so malformed payloads cannot poison later reads; regenerate TSOA/Orval artifacts after contract changes.
- [ ] Build, full tests, lint and touched-file format checks pass; unrelated repository formatting drift is reported without wholesale changes.
- [ ] Record any remaining operational migration/model configuration steps separately; do not deploy or change live data as part of verification.

## Comments

Implementation authorized by the user invoking implement-spec. The acceptance evidence must describe actual behavior verified, not merely test counts.
