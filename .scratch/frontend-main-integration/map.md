# frontend-main integration

## Scope and ownership

- Codex owns runtime configuration, BE login snapshot response, integration checks, and coordination records.
- User baseline: apps/fe deleted, apps/frontend-main supplied as an untracked FE copy. Preserve these migration intentions.
- User approved connecting likelion-kkadak/frontend as a submodule. Original copy backed up under ignored .data.
- All frontend edits use a topic branch and PR; main direct pushes and automatic merges are prohibited.
- Herdr ggaddak workspace w1, dev tab w1:t3: BE w1:p3, FE w1:p4, BOT w1:p5; verification w1:p2.

## Findings

- Root scripts still targeted removed apps/fe; dev:fe now targets frontend-main and api:sync generates BE contracts without removed Orval consumers.
- New FE port3000 conflicted with another process; parent runtime launcher uses configured FE_PORT3002 to match the existing OAuth callback.
- Local BE schema needed guild access migration. Official backup/upgrade/check completed before service startup.
- Actual login200 was followed by a transient guilds502. FE treated the follow-up failure as login failure. Login now returns the guild snapshot already verified by Discord and FE consumes it without an immediate second lookup.
- Credential-free replay of an existing session later returned guilds200; original upstream502 reason could not be reconstructed from earlier logs. Sanitized upstream status logging added for recurrence.
- Cards are stored in the user's authorized server 우땅의 마크: CONFIRMED7, ON_HOLD2, IN_REVIEW325, DISCARDED6, SUPERSEDED1. Other authorized servers had zero records. Empty FE responses corresponded to a selected server with no cards.

## Verification

- FE, BE and Bot built successfully; local DB readiness check clean after backup and migration.
- FE running localhost3002, BE health200 at localhost3001, Bot connected to Discord and registered existing commands.
- Login guild-snapshot regression went red before BE fix and is now green. Targeted BE auth/access tests14passed, BE typecheck passed, new FE production build passed, E2E9passed.
- Live OAuth and FE card queries observed. Installed-server browser regressions cover cookie bootstrap, selection, errors, and stale request isolation; see installed-guild-selection. JWT is memory-only and renewal no longer triggers guild inventory polling.

## Frontend PR

- https://github.com/likelion-kkadak/frontend/pull/3
- Original repo rejected branch push403; topic branch published in WooDDANG/frontend fork and submitted upstream as a PR.
- FE submodule remains on the pending PR branch; main was not pushed or merged. The parent pointer intentionally tracks the tested PR commit until human merge.
- User requested installed joined-server selection; implementation and verification are recorded in installed-guild-selection. BE committed c3882a2 on parent branch feat/installed-guild-selection.
