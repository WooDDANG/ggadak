# 05 — Semantic Admission and Silent Feedback

Type: task
Status: resolved
Blocked by: 03

## Scope

Implement shared admission and Discord feedback in [spec.md](../spec.md). Use backend-owned validated policy, maintain semantic admission through preprocessing, and preserve the reaction-only automatic channel workflow.

## Acceptance

- [x] Semantic-positive/regex-negative Korean and English discussions reach the production AI seam under the shared policy.
- [x] Bot and BE share policy and current threshold; manual analysis bypasses admission without bypassing validation or execution locks.
- [x] Bot-owned processing reactions never increase human agreement; relevant trigger evidence survives filtering/slicing.
- [x] 👀 reflects active work; 📝 requires durably stored/reused candidates; no-decision/failure/cancellation/coalescing remove obsolete Bot reactions only.
- [x] Automated channel processing sends no approval embeds/messages. Private command responses include configured review link and accurate queued/completed/failed outcomes.
- [x] Retire Discord conflict approval handlers; any compatibility API uses the Web-owned review service rather than unconditional success.

## Comments

Implementation authorized by the user invoking implement-spec. Test cancellation and user-reaction preservation, not just successful analysis.

## Answer

Added validated backend-owned semantic threshold (default 0.7), retained the last valid synchronized policy and refresh it on the Bot. Backend admission evaluates original session evidence, including semantic-only intent and human reactions, after preprocessing. Bot-owned reactions are subtracted before dispatch, and protocol reaction counts/timestamps/message IDs are validated before any analysis claim. Burst/short-agreement provenance and trigger evidence remain available to the gate.

Processing reaction settlement runs inside the channel execution slot before subsequent work starts. Startup reconciles obsolete processing reactions; recovery and Web retries reconcile success/failure reactions. Cleanup removes only the Bot user; durable candidates alone add 📝. Failures add no channel messages/approval embeds. Private scan replies include `REVIEW_WEB_URL` and report completed/pending/failed range counts. Existing retired legacy conflict routes remain 404; Web review is authoritative.

Evidence: `apps/be/tests/semantic-admission.test.ts` reaches the production AI seam with regex-negative Korean/English signals and rejects Bot-only agreement/noise. Bot delivery tests verify own-user reaction removal, cancellation/merging and settlement before the next execution. Existing server regressions verify retired approval routes.
