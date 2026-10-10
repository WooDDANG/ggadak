# 06 — Atomic Review and Action Item Disposition

Type: task
Status: ready-for-agent
Blocked by: 01

## Scope

Implement Web-owned review in [spec.md](../spec.md), following ADR-0019. Make versioned review the authoritative decision transition. Define typed replacement/Independent Retention and Action Item disposition contracts; persist all edited fields.

## Acceptance

- [ ] Saving a Draft never supersedes an existing record; ordinary confirmation and Independent Retention leave predecessors unchanged.
- [ ] Replacement requires a valid same-guild Decided predecessor and explicit unfinished Action Item cancellation/transfer.
- [ ] Candidate confirmation, predecessor replacement, reviewer edits and task dispositions commit atomically and survive restart.
- [ ] Completed tasks remain in historical record; transfers preserve provenance; unknown legacy completion requires review.
- [ ] Stale candidate/predecessor versions and concurrent double replacement return conflict without partial writes.
- [ ] Topic matches nominate comparison records, not automatic conflicts; Supersede does not automatically set Pivot.
- [ ] Retained conflict routes delegate to the same validation/transaction and surface failure rather than reporting unconditional success.

## Comments

Implementation authorized by the user invoking implement-spec. Test database rollback and concurrent review with actual isolated Prisma transactions.
