# Implementation verification

## Scope and delivery

Implemented selected-guild installation status, manager-only verified installation
URLs, existing guild authorization reuse, TSOA/Orval generation, and external FE
handoff documentation. The actual FE remains externally developed; no demo UI
changes were made. Operating databases and live Discord accounts were not used.

agy implemented the BE in the Herdr worker pane. Codex integrated generation,
review fixes and acceptance tests. Documentation was prepared by a Codex sub-agent.
After the user's direction, checks run visibly in the Herdr verify pane.

## Checks

- New adapter/service/HTTP tests: 26 passed after review-driven coverage additions.
- Repository type checking: passed after integration.
- New and touched BE TypeScript formatting: passed.
- BE suite run by agy before final coverage additions: 45 files, 156 tests passed.
- Final root `npm test`: passed, 244 tests (Shared 15, BE 163, Bot 41, FE 17, E2E 8).
- Final generated contract/document snapshot check: passed (JWT/query, five required fields, enum, nullable URL, Orval client, matching Swagger SHA-256).
- Targeted ESLint on touched BE modules and tests: passed.
- `git diff --check`: passed.

## Standards

Independent review: zero hard violations. Two nonblocking smell findings:

1. Unused duplicate loader injection and unused adapter request options: removed.
2. Repeated fixture setup in existing new adapter cases: retained as an advisory;
   the later failure matrix uses a compact fixture with explicit expectations.

## Spec

Independent review initially found two acceptance-test gaps: expired authentication
and per-guild rechecks, plus actual external failure/malformed-response inputs.
Both were addressed. The reviewer rechecked and reported zero remaining findings.

## External FE / live checks

The checklist in [bot-installation.md](../../docs/api/bot-installation.md) remains
for the actual FE developer: live Discord install/cancel, focus return, role-based
presentation, and channel setup. Fixture/HTTP test success does not establish
completion of that separate integration.
