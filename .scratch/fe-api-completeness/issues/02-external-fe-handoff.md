# 02: 실제 FE 개발자용 설치·인증 연동 계약

Status: resolved
Type: task
Owner: Codex documentation agent / Codex integration
Execution: done
Blocked by: 01 (final API alignment and Swagger snapshot)

Spec: [spec.md](../spec.md)

## Acceptance criteria

- [x] Document configurable FE origin and cookie-based session restoration/logout.
- [x] Document installation states, role-specific guidance, separate-tab installation and focus/manual rechecks.
- [x] Preserve existing data access and defer guild-scoped External Feedback.
- [x] Align examples and generated contract with the completed BE API.
- [x] Refresh the Swagger SHA-256 and validate links.

## Comments

Documentation draft completed in docs/api/frontend-api.md and
docs/api/bot-installation.md. Final alignment awaits ticket 01 and generation.

Validation: see [verification.md](../verification.md). Implementation, generation,
contract alignment, type checks, targeted lint, and all 244 repository tests passed.
