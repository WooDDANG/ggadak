# Domain values and configuration

Shared runtime values live in `packages/shared/src/domain-values.ts`. Decision states, categories, feedback source types, Action Item states, observations, review actions/resolutions, sync statuses, delivery statuses/errors and graph node/edge types use named `as const` enum objects. Their types are derived from those objects, and Zod/DTO contracts reuse the same definitions. Existing wire strings and SQLite values are unchanged. `ReviewAction` remains the complete review request type; `ReviewActionType` identifies its action field.

Use these names in application logic instead of repeating wire strings. Fixtures may deliberately send literal wire values to verify compatibility. Do not combine unrelated states just because their strings match: a durable receipt, an Analysis Request, a scan and a Sync Job have different lifecycles. BE-only AI stages, workflow phases and request states stay in `apps/be/src/domain/`.

## Configuration ownership

| Location | Responsibility |
| --- | --- |
| `packages/shared/src/config.ts` | Harvesting policy schema, defaults and environment overrides. Defaults are derived from the schema. |
| `packages/shared/src/runtime-policy.ts` | Shared timing contracts, bounded delivery/analysis/sync policies, Discord page/chunk limits, service defaults and duration/storage units. |
| `apps/be/src/config/index.ts` | BE environment configuration and credentials. |
| `apps/be/src/config/policies.ts` | Auth expiry/refresh policy, graph size/time/call budgets and AI defaults. |
| `apps/bot/src/config.ts` | Bot URL precedence, trigger defaults and lazy delivery environment settings. |
| `apps/fe/src/config.ts` | Browser query freshness and polling intervals. |

Existing environment names, URL precedence and default values are preserved. Shared timing values protect cross-process contracts: Bot status heartbeat is 5 seconds, BE status freshness is 15 seconds, analysis leases last 60 seconds and renew every 20 seconds, sync leases last 120 seconds and renew every 30 seconds. Configure deployment-specific values using the existing `.env` keys; fixed domain values belong in enums rather than environment variables.

`@ggaddak/shared` has a browser entry at `packages/shared/src/browser.ts` so FE runtime imports do not include the Node logger. Keep credentials, server adapters and filesystem code out of that entry. The Node package entry remains unchanged.

When changing a shared contract, build Shared, run `npm run api:sync`, and check all consumers. Generated Swagger/routes/Orval files are updated through generation rather than edited by hand.

FE generated types live in `apps/fe/src/api/generated/model/`. Orval's split schema output includes response envelopes, nested object types and enums as individual files; these are API contracts rather than separate domain entities. `apps/fe/orval.config.js` enables `clean: true` for the generated directory so removed schemas do not accumulate. Orval emits the client and schema barrel as two generated files, instead of hundreds of per-model files. Keep hand-written adapters outside `src/api/generated/` because regeneration replaces that directory.
