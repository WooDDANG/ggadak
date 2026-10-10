# 06 — Atomic Review and Action Item Disposition

Type: task
Status: resolved
Blocked by: 01

## Scope

Implement Web-owned review in [spec.md](../spec.md), following ADR-0019. Make versioned review the authoritative decision transition. Define typed replacement/Independent Retention and Action Item disposition contracts; persist all edited fields.

## Acceptance

- [x] Saving a Draft never supersedes an existing record; ordinary confirmation and Independent Retention leave predecessors unchanged.
- [x] Replacement requires a valid same-guild Decided predecessor and explicit unfinished Action Item cancellation/transfer.
- [x] Candidate confirmation, predecessor replacement, reviewer edits and task dispositions commit atomically and survive restart.
- [x] Completed tasks remain in historical record; transfers preserve provenance; unknown legacy completion requires review.
- [x] Stale candidate/predecessor versions and concurrent double replacement return conflict without partial writes.
- [x] Topic matches nominate comparison records, not automatic conflicts; Supersede does not automatically set Pivot.
- [x] Retained conflict routes delegate to the same validation/transaction and surface failure rather than reporting unconditional success.

## Comments

Implementation authorized by the user invoking implement-spec. Test database rollback and concurrent review with actual isolated Prisma transactions.

## Answer

Implemented required versioned review contracts in shared schema and TSOA DTO, atomic guarded candidate/predecessor updates, same-guild active predecessor validation, explicit legacy classification and unfinished task cancel/transfer with provenance. Ordinary approval/Independent Retention clear suggested replacement links without changing predecessors; replacements retain isPivot rather than inferring it. Generic saves cannot bypass reviewed state transitions or overwrite a newer version. Compatibility conflict endpoint delegates to authoritative review and propagates validation/conflict/not-found failures.

Verification: shared/BE builds pass; 11 real isolated SQLite repository/controller tests pass, including concurrent double replacement, stale candidate/predecessor, cross-guild rejection, injected write failure after predecessor update (full rollback), restart recovery, cancellation, transfer, unknown completion classification and generic-save protection. Touched source lint/format pass. Topic comparison/Pivot extraction change coordinated with ticket 02. API artifacts regenerated.
