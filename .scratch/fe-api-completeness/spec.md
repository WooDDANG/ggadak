# External FE integration: bot installation onboarding

## Agreed scope

The actual FE is developed separately. This repository's FE is a demo and does
not define production feature completeness. The user confirmed that the pasted
integration document is the entire feedback received from the FE developer.

Add an explicit Bot Installation Status contract and installation guidance for
the selected guild. Update the integration contract for the external FE developer.
Guild-scoped External Feedback registration/listing remains a separate future
feature. Existing BE edit, list, search, Timeline, review, Sync Job, and analysis
recovery endpoints should be reused rather than duplicated.

## Agreed behavior

1. After server selection, query that server's status through a dedicated API.
   Login and the guild list must not trigger checks for every guild.
2. Distinguish `installed`, `not_installed`, and `unknown`. Failed configuration,
   credentials, external connectivity, or ambiguous Discord errors must not be
   presented as confirmed absence. Installation does not assert that the Bot
   process is online or that every channel is readable.
3. Show an installation action to users who own the server or have Manage Server
   permission. Other members receive guidance to ask a server manager. Reuse the
   existing BE guild-authorization policy; browser checks do not grant access.
4. Open installation in another tab. Preserve the selected guild and login state.
   Recheck when the FE regains focus and provide a manual recheck action. Advance
   to channel setup only after the selected guild is confirmed installed.
5. A failed check or canceled installation leaves the FE in the appropriate
   onboarding state; it does not claim success from an OAuth window closing.
6. Installation status is separate from channel accessibility, which remains
   represented by the existing channel API.
7. Existing guild-authorized decision reads, reviews, and search remain available
   when the bot is absent or status is unknown. No application-wide install gate.

## BE contract

The endpoint/field names below were adopted by the implementation and are now
present in the generated OpenAPI document.

`GET /api/v1/discord/bot-status?guildId=<string>`

- Bearer authentication and the existing selected-guild membership check.
- Standard v1 response envelope.
- Suggested data fields: `guildId`, `status`, `canManage`, `installUrl`, `checkedAt`.
- `status`: `installed | not_installed | unknown`.
- `canManage`: BE-derived permission to manage the selected guild.
- `installUrl`: nullable, BE-generated, offered for confirmed absence to eligible
  managers when installation configuration is valid. The selected guild must be
  carried in the installation flow and checked again afterward.
- `checkedAt`: ISO timestamp of the observation/attempt, not a guarantee of
  continuing membership. Any cached response needs explicitly documented freshness.
- Missing/expired authentication and unauthorized guild access remain HTTP 401/403;
  they must not be converted into successful `unknown` responses.
- Operational inability to establish installation returns `unknown` without
  leaking credentials or recommending repeated installation. Define stable public
  reasons only if FE must render materially different recovery actions.

Determine installation from a documented Discord membership observation. Only
affirmative absence evidence may produce `not_installed`; arbitrary channel 403/404
responses are insufficient. Verify both positive and negative observations with
transport fixtures before selecting the adapter mapping.

Generate a guild-install URL on BE using the configured application identity and
permissions required by current Bot behavior. Use the existing code's reading,
reaction, and slash-command needs to select permissions. Preserve the separate
user-login OAuth flow. Official references consulted:
[Discord OAuth2](https://docs.discord.com/developers/topics/oauth2) and
[Discord permissions](https://docs.discord.com/developers/topics/permissions).

## External FE handoff

- Publish the new status/install contract with examples for every state and role.
- Explain new-tab installation, focus/manual rechecks, and selected-guild cache keys.
- Document authenticated read/review availability during onboarding.
- Refresh browser session bootstrap/recovery/logout documentation using the
  current persistent-cookie flow and existing `POST /api/v1/auth/session`.
- Describe the actual FE origin as configurable. Its exact callback URI and origin
  must match BE/Discord configuration; the demo's port is not a production FE requirement.
- Publish one coordinated Swagger/document snapshot with a freshly calculated hash.
  Check generated types for nullability and actual strict validation behavior;
  remove outdated caveats only when the underlying schema has been corrected.
- Clearly separate existing APIs, the newly added endpoint, and deferred proposals.
- The external FE developer owns production screen integration. Changes to the
  local demo UI are outside this agreed investigation scope.

## Acceptance evidence

- Adapter/service tests cover confirmed presence, confirmed absence, unknown,
  malformed responses, external failures, invalid configuration, and channel
  permission failures without false absence classification.
- HTTP tests cover v1 envelope, guild isolation, missing/expired auth, manager vs
  member output, installation URL parameters, and timestamps.
- After installing in a different guild or canceling installation, the selected
  guild must remain absent/unknown until its own fresh check confirms presence.
- Existing decision reads/reviews/search remain authorized independently of
  installation state. Existing channel permission checks still apply.
- OpenAPI and generated-client checks match the final response contract.
- Live Discord installation and the separately developed FE require an explicit
  handoff checklist; fixture tests alone do not claim those integrations passed.

## Investigation result

See [findings.md](findings.md) for source evidence and documentation drift.
The interview was followed by the user-authorized implementation. BE delivery and
verification are recorded in [verification.md](verification.md). The external FE
and live Discord handoff remain with the actual FE developer.
