# External FE API audit — preliminary findings

## Review boundary

The production FE is developed separately. `apps/fe` is the user's demo and does
not define missing production features. The pasted document contains the common
integration section; the repository also contains a longer, partly newer document.
Real FE screen requirements beyond the pasted content have not been supplied.

## Confirmed documentation drift

- FE port: the pasted document and `docs/api/frontend-api.md` say 3000. The local
  demo defaults to 3002 (`apps/fe/vite.config.ts:8`). The external FE may choose its
  own origin; document this as a configurable FE origin. Its callback URI must
  match BE `DISCORD_REDIRECT_URI` and the Discord OAuth registration, and its origin
  must satisfy the BE allowlist. Do not impose the demo's port on the real FE.
- Browser auth: the common section's Bearer-only summary is incomplete. BE has
  `POST /api/v1/auth/session` with a persistent HttpOnly cookie and an Origin check
  (`apps/be/src/api/controllers/auth.controller.ts:44`). Cookie logout also works
  without a current access JWT (`auth.controller.ts:80`). Document bootstrap,
  expired-access recovery, session expiry, and logout for the external FE.
- Snapshot provenance: the pasted Swagger hash and the repository document's hash
  both differ from the checked-in Swagger. Observed SHA-256:
  `71ff3303743818b78c9e734b8a348d25ab99488cbf52aaef15dbb3d1471815f5`.
  Publish a coordinated spec/document snapshot before external FE code generation.
- The sample fetch wrapper parses JSON before preserving HTTP errors. A proxy's
  empty or HTML failure would throw a parsing error without the intended status/code.
  This is a sample/client robustness issue, not evidence that a new BE endpoint is needed.

## Existing BE capabilities — avoid duplicate feature requests

| Journey | Existing implementation evidence |
| --- | --- |
| Login/session recovery and server selection | `apps/be/src/api/controllers/auth.controller.ts` |
| Guild-scoped channel reads and manager-only configuration | `apps/be/src/api/controllers/channels.controller.ts` |
| Dashboard metrics and latest job ID | `apps/be/src/services/dashboard.service.ts` |
| Manual Sync Job creation, lookup, failed transfer resume | `apps/be/src/api/controllers/sync-jobs.controller.ts` |
| Review Queue and versioned review | `apps/be/src/api/controllers/v1-review.controller.ts` |
| Decision detail, versioned edit, history, filtered/paged list, Timeline | `apps/be/src/api/controllers/v1-decision.controller.ts` |
| Why search | `apps/be/src/api/controllers/search.controller.ts` |
| Analysis delivery state and manager-only retry | `apps/be/src/api/controllers/analysis-deliveries.controller.ts` |
| Analysis Request state and completed graph snapshot | `apps/be/src/api/controllers/analysis-request.controller.ts` |

These are source-level confirmations, not a declaration that the external FE or
live Discord/AI connections passed end-to-end tests. Relevant BE test suites exist
under `apps/be/tests`; this audit has not rerun them.

For example, resuming a Sync Job after a browser reload can use
`dashboard.sync.latestJob.jobId` followed by the existing job lookup endpoint.
The demo's local-only job state does not establish a missing BE endpoint.

## BE additions conditional on real FE requirements

1. **Bot installation/onboarding state**: `DiscordGuild` currently returns id,
   name, icon, owner, and permissions (`apps/be/src/adapters/discord-auth.adapter.ts:8`).
   There is no explicit `botInstalled` field in that contract. If the real FE must
   distinguish bot-not-installed, inaccessible channels, and temporary Discord
   failures before channel setup, agree on the states and the owning endpoint.
   A definitive onboarding contract is additional work; inferring it from every
   channel-load error would not be reliable.
2. **Guild-scoped External Feedback**: the legacy controller only exposes
   `/api/feedbacks` with channelId/limit and no guild authorization contract
   (`apps/be/src/api/controllers/feedback.controller.ts`). A production server-specific
   Feedback Board requires an agreed authenticated, guild-scoped contract and data
   ownership rules. Search/integration into analysis are further requirements to
   decide separately. The existing demo screen does not make them mandatory.

The core journeys do not by themselves justify finer-grained error codes, numeric
IDs, free-form categories, or draft URI aliases. Capture an actual FE constraint
before changing these contracts.

## Next decision

The user subsequently confirmed that there is no additional FE feedback, included
bot installation status/onboarding, and deferred guild-scoped External Feedback.
The agreed scope and proposed contract are recorded in [spec.md](spec.md).
Keep demo UI work separate from the external FE developer's implementation.
