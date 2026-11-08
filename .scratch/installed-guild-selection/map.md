# 설치된 가입 서버 선택

## Orchestration

- User approved the three-ticket breakdown with implement.
- Root Codex owns BE selection/inventory adapter, HTTP tests, DTO/contract, docs, generated Swagger, package/parent integration records and commit.
- Frontend worker owns the frontend submodule source and browser tests only; topic branch fix/be-session-integration, pending PR3. Root coordinates pushes/PR updates and parent gitlink.
- All checks run serially through Herdr ggaddak verify pane w1:p2. Dev panes remain FEw1:p4, BEw1:p3, Botw1:p5.
- Baseline: user removed apps/fe; pending parent integration changes and new frontend submodule already approved. Preserve original FE backup under .data.
- Parent branch: feat/installed-guild-selection. BE commit c3882a2 contains the selection policy, inventory recovery, revision guard, HTTP regressions and API docs.
- Tickets01–03 done; final frontend browser verification and PR integration completed. Ownership overlaps are serialized rather than artificial blocking edges.

## Contract

- Login/session/guild-list responses retain guilds and add guildSelection:{status:ready|unavailable,checkedAt:ISO|null}.
- ready with no guilds means no installed joined servers; unavailable must gate old server data and offer retry without clearing the login session.
- No default-branch frontend push or automatic merge; PR title/body in Korean.

## Verification

- BE full regression: 50 files / 183 tests passed. Final installation/event/pagination/race regression: 8 tests passed after revision-scoped sharing was added.
- Bot regression: 53 tests passed. Real BE/Bot HTTP E2E: 9 tests passed.
- BE build/API generation and root type checks passed before final FE review fixes. FE initial Chrome bootstrap/selection/error regression and production build passed.
- Spec review found two FE defects (recovery selection loss and stuck loading after cookie rebootstrap); both corrected and reviewer rechecked. Standards review found no documented violations; optional shared JWT-renewal refactor remains outside this change.
- Final browser scenario additionally covers account/server stale responses and safe GET token recovery without mutation replay. Actual Discord uninstall/reinstall operations are simulated at the external event/API boundary, not performed against the user's live servers.

## Completion

- FE e45aa8b committed on fix/be-session-integration and pushed to the PR branch only. Korean PR: https://github.com/likelion-kkadak/frontend/pull/3 .
- Final Chrome regression 1/1 passed; FE production build and root typecheck passed. Both blocking spec-review findings corrected and rechecked.
- Parent submodule intentionally pins e45aa8b while PR #3 awaits human review/merge. No automatic merge or main push.
