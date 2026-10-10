# 05 — Semantic Admission and Silent Feedback

Type: task
Status: ready-for-agent
Blocked by: 03

## Scope

Implement shared admission and Discord feedback in [spec.md](../spec.md). Use backend-owned validated policy, maintain semantic admission through preprocessing, and preserve the reaction-only automatic channel workflow.

## Acceptance

- [ ] Semantic-positive/regex-negative Korean and English discussions reach the production AI seam under the shared policy.
- [ ] Bot and BE share policy and current threshold; manual analysis bypasses admission without bypassing validation or execution locks.
- [ ] Bot-owned processing reactions never increase human agreement; relevant trigger evidence survives filtering/slicing.
- [ ] 👀 reflects active work; 📝 requires durably stored/reused candidates; no-decision/failure/cancellation/coalescing remove obsolete Bot reactions only.
- [ ] Automated channel processing sends no approval embeds/messages. Private command responses include configured review link and accurate queued/completed/failed outcomes.
- [ ] Retire Discord conflict approval handlers; any compatibility API uses the Web-owned review service rather than unconditional success.

## Comments

Implementation authorized by the user invoking implement-spec. Test cancellation and user-reaction preservation, not just successful analysis.
