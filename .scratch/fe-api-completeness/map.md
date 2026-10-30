# FE API integration completeness

## Scope

The user clarified that the actual FE is developed separately by a FE developer.
The FE in this repository is a separately built demo. Evaluate whether the current
BE API supports the real FE developer's journeys: login, server/channel settings,
Dashboard, Review Queue, detail/edit, search, Timeline, and analysis failure recovery.
Demo-only omissions are not production feature requirements. Draft-only features
are separate candidates. This is an investigation and design interview;
implementation is not yet assigned.

## Decisions so far

- Compare the current implementation and Swagger, rather than treating the
  pasted 2026-10-13 document as the current contract.
- Distinguish stale documentation, missing FE integration, missing BE capability,
  and behavior that requires a product decision.
- Treat local FE integration observations only as reference. Additional BE work
  requires a verified contract/capability gap or a real FE product requirement.
- The user confirmed that the pasted integration document is the entire material
  received from the real FE developer; no separate feature requests were supplied.
- Include explicit bot installation status and installation guidance after server
  selection (Q2 accepted).
- Defer guild-scoped External Feedback registration/listing to a later effort
  (Q3 accepted). It is not a dependency for this integration.
- Query bot installation through a dedicated API for the selected guild, rather
  than checking every guild during login (Q4 accepted).
- Represent installation as installed / not installed / unknown; Discord outages
  or configuration errors must not masquerade as absence. Channel accessibility
  remains part of the existing channel contract (Q5 accepted).
- Managers receive installation guidance with an installation action; ordinary
  members receive guidance to ask a server manager. Recheck after installation
  and continue to channel setup (Q6 accepted).
- Open installation in a separate tab; recheck when the FE regains focus and
  provide a manual recheck action, preserving the selected guild (Q7 accepted).
- Preserve authorized access to existing Decision Records, reviews, and search
  when installation is absent or unknown. Installation onboarding is not a
  prerequisite for reading or reviewing stored data (Q8 accepted).

## Orchestration

Tracking tickets: [01 — BE API](issues/01-bot-installation-status.md),
[02 — external FE handoff](issues/02-external-fe-handoff.md),
[03 — integration and verification](issues/03-integration-verification.md).
Tickets were split after implementation had begun against the agreed spec;
the existing assignments remain in effect, with no duplicate dispatch.

Implementation authorized through `$implement`. Review baseline:
`a934822b41145d457df125ba6b8b5554d9820c42`.
Pre-agreed test seams: Discord transport adapter, installation service, and
authenticated HTTP contract (see spec acceptance evidence).
The user explicitly authorized Codex to inspect and answer agy approvals for
assigned file reads, owned-file creation/edits, tests, and type checks, then made
this a standing project instruction in AGENTS.md and docs/agents/orchestration.md.
It excludes deletions, permission-setting changes, deployments, and operating DB changes.

| Work | Agent | Owned files | State |
| --- | --- | --- | --- |
| BE installation API and adapter/service/HTTP TDD | agy (Herdr worker) | Installation adapter/service/DTO/controller/tests; auth.service.ts and loaders/index.ts | done |
| FE handoff documentation | Codex documentation sub-agent | docs/api/frontend-api.md and bot-installation.md | done |
| Generation, integration, checks and commit | Codex | Generated API files, this effort directory | done |

Existing user changes include deletion of `docs/be-storage-parallel-sessions-report.md`
and untracked `docs/ai-agentic-architecture.md`; preserve both. Orchestration setup
changes to AGENTS.md, package.json, and docs/agents/orchestration.md predate this audit.

## Open questions

No product-scope questions remain from this interview. The agreed behavior and
proposed API shape are captured in [spec.md](spec.md). The user subsequently
authorized implementation with `$implement`.
Guild-scoped External Feedback is deferred.
Existing code and tests are evidence of implementation, not proof of live Discord
or AI integration success.

## Reference verification

Preliminary source-backed audit: [findings.md](findings.md). Codex independently
checked the primary BE controllers while the worker's command approval was pending.

Local demo FE tests: `npm run test --workspace=@ggaddak/fe` passed 17/17 in the
Herdr verify pane. An HMR port-in-use message appeared without test failures.
These fixture tests do not verify the separately developed FE or live integrations.

## Completion

All three implementation tickets are resolved. See [verification.md](verification.md)
for results and the remaining external FE/live Discord handoff checklist.
