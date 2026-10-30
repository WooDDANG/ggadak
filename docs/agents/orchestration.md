# Herdr orchestration

## Assignment flow

The user prepares specs and implementation tickets centrally with the matt skills,
then assigns a ticket, feature directory, or explicit set of tickets to Codex.
That assignment authorizes Codex to coordinate the assigned work through Herdr.
Unassigned tickets remain outside the scope of the assignment.

- **User**: priorities, scope, and product or architecture decisions left open by the spec.
- **Codex**: dependency analysis, task dispatch, review, integration, and final verification.
- **agy**: implementation of the assigned scope and its relevant checks.

Discover live agents for every assignment; names, pane IDs, and availability can
change. `agy` is the preferred existing worker, not a hard-coded pane ID.
Use additional agents only when the assigned work benefits from parallel execution.
Prefer Herdr workers for coordination requested through Herdr.

## Start and inspect

The current Herdr session is `default`, with workspace `GGADDAK`:

| Tab | Pane | Purpose |
| --- | --- | --- |
| `main` | `Coordinator · Codex` | User assignments, dispatch, review, integration |
| `worker` | `Worker · agy` | Assigned implementation |
| `dev` | `BE` (left) | `npm run dev:be` |
| `dev` | `FE` (right) | `npm run dev:fe` |
| `verify` | `Tests · Build` | Coordinated tests, builds, API generation |

All panes start in the repository root. At initial setup, BE and FE commands are
typed at their shell prompts, awaiting Enter. Inspect the prompt before sending
any new command; clear an existing input line before replacing it. Discover live
tab and pane IDs through Herdr instead of retaining IDs from an earlier session.
Keep dev servers in their dedicated panes so worker output and test results stay
readable. Herdr manages persistence; use `herdr session list` to locate the existing
session before creating a new one.

Run from this repository inside Herdr:

```bash
npm run agents:codex
npm run agents:resume -- --last
```

These commands bypass the shared Codex daemon so the calling pane's environment
can reach command execution. In the observed Codex 0.166.0 daemon path, `HERDR_*`
variables were absent; resuming with `--no-daemon` restored `HERDR_ENV=1`.

Before any Herdr control command, require `HERDR_ENV=1` and follow the installed
Herdr skill. Discover CLI syntax with `herdr --help` and the relevant command group.
If the environment check fails, report that Herdr caller context is unavailable
and request relaunch from the intended pane. Setting the flag manually does not
establish caller identity.

## Dispatch

1. Read the assigned spec, tickets, `AGENTS.md`, relevant context docs, and ADRs.
   Inspect `git status` and preserve existing user changes.
2. Follow the tracker conventions in [issue-tracker.md](issue-tracker.md).
   Resolve ticket dependencies before dispatch. A dependency is satisfied only
   when its acceptance criteria and checks have been verified.
3. Record assignments under `## Orchestration` in the assigned effort's `map.md`.
   If no map exists, create one in that effort directory. Record each ticket's
   agent, owned files/directories, dependencies, baseline changes, and execution
   state (`pending`, `running`, `blocked`, `review`, or `done`). These execution
   states are separate from the tracker's canonical triage labels.
4. Give each writable file one owner at a time, including the map and issue files.
   Codex owns coordination records. Parallelize independent file scopes; serialize
   overlapping scopes. Reserve shared contracts, lockfiles, generated API files,
   and database migrations for one explicit owner.
5. Confirm the worker's live agent identity, repository directory, and readiness.
   Dispatch only to an available worker in the intended checkout. Create additional
   panes only as needed, preserving cwd and focus according to the Herdr skill.
6. Send the task through `herdr agent prompt` using an explicit live agent name
   or pane ID. Include the ticket path, acceptance criteria, owned files, dependencies,
   baseline user changes, required checks, and expected report. Workers must read
   these instructions and the ticket before editing. Workers report blockers to
   Codex and leave coordination records to Codex.

Workers return changed files, acceptance criteria met, commands and results, and
remaining blockers. Workers leave changes uncommitted for Codex's integration
review unless the user explicitly requests commits. Changes outside the assigned
file scope require coordination with Codex before editing.

## Review and completion

### Delegated agy approvals

The user explicitly authorized the coordinator to handle agy approval prompts
through Herdr for assigned repository work. This is a standing project instruction,
not limited to the first implementation ticket. Inspect the current approval UI
and the action before answering. Approve file reads, creation/edits within the
worker's assigned file ownership, tests, and type checks without asking the user
again. Choose a one-time approval; inspect the next prompt independently.

This delegation excludes deletions, permission-setting changes, deployments,
operating database changes, unrelated files, and credential disclosure. Escalate
those actions to the user when they are not separately authorized. Do not change
agy's global permission settings or blindly approve arbitrary prompts. The user's
explicit delegation takes precedence over a generic skill instruction to ask
before answering these covered approval dialogs.

### Verification

- Read worker output and inspect the actual diff. Herdr `idle`/`done` is a signal
  to inspect results, not proof that the ticket passed. After a submission timeout
  or stalled prompt, inspect state and output before sending the task again.
- Check changes against the ticket, ownership boundaries, existing user edits,
  and relevant ADRs. Return actionable findings to the worker before integration.
- Select checks from the current workspace `package.json`; build Shared before
  consumers when needed. Codex coordinates builds and API generation so parallel
  workers do not overwrite shared outputs. Contract changes require checking both
  producers and consumers; cross-context behavior requires relevant integration
  or end-to-end checks. Report unavailable dependencies and failing checks explicitly.
- Mark execution `done` only after acceptance criteria and relevant checks pass.
  Record changed files, verification evidence, and unresolved follow-ups in the
  ticket's comments and update the map. Preserve existing ticket status conventions.
- Report completed tickets, verification results, and remaining blockers to the user.
  Publishing, deployments, and messages to people require their own authorization;
  implementation assignment alone does not authorize them.
