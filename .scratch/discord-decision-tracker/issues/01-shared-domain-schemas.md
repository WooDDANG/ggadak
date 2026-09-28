# 01 — Shared Domain Schemas

**What to build:** Define shared Zod schemas and TypeScript types for `Decision`, `Rationale`, `ActionItem`, `DecisionState`, and `DecisionPayload` in `@ggaddak/shared` so that `bot`, `be`, and `fe` share a single source of truth for all data contracts.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Define `DecisionStateSchema` (`Proposed`, `Discussing`, `Decided`, `Superseded`)
- [x] Define `ActionItemSchema` (task, assignee, dueDate)
- [x] Define `DecisionSchema` and `DecisionPayloadSchema`
- [x] Export TypeScript types derived with `z.infer`
- [x] Add unit tests verifying parsing and serialization
