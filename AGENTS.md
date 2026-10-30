# Agent Guidelines

## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo layout. See `docs/agents/domain.md` and `CONTEXT-MAP.md`.

### Herdr orchestration

When the user assigns implementation tickets or requests multi-agent coordination in Herdr, follow `docs/agents/orchestration.md` for dispatch, file ownership, integration, and verification.

The user delegates agy's approval prompts for assigned repository file reads, owned-file creation/edits, tests, and type checks to the coordinating agent. Inspect each prompt and approve matching actions without asking again; see the approval boundaries in `docs/agents/orchestration.md`.
