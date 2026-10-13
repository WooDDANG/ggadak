# Reliability implementation verification

All tickets 01–08 are complete. `npm test` passes 133 tests: Shared 15, BE 74, Bot 31, FE 10 and E2E 3. The command builds every workspace first. Typecheck, lint, changed-file format and diff checks pass. The only lint warning is the existing unused `beforeEach` import in the shared logger test.

| Behavior | Verification boundary |
| --- | --- |
| Full domain persistence, restart and failed writes | BE repository and additive migration tests use isolated SQLite fixtures |
| Stable request replay, concurrent claims and crash recovery | DiscussionService tests use deterministic IAiAdapter and fenced persistent claims |
| Atomic review/task transfer and stale/double replacement | Repository/HTTP review tests verify rollback, versions and persisted task provenance |
| Durable waiting, bounded retries, timeout/body stall and channel serialization | Bot delivery tests exercise service instances and startup/message/reaction/command/recovery entrypoints |
| Failed-first/later-completed ranges, bounded gaps, restart and response-loss acknowledgement | Bot scan tests plus authenticated monotonic checkpoint HTTP tests |
| Precise pagination and declared initial coverage | Large snowflake and 205-message Discord fixture tests |
| Semantic-positive/regex-negative Korean and English | Production DiscussionService AI seam; human/Bot reactions and malformed payload checks |
| Reaction-only processing and caller settlement | Bot own-user cleanup, debounce/cancellation and cleanup-before-next-execution tests |
| Related/reanalysis history, rejected exact reuse and guild isolation | Web history HTTP integration and FE mocked-HTTP/SSR tests |
| Stale-review refresh and disconnected retry states | FE conflict workflow and recovery tests; BE stale snapshot/idempotent command tests |
| Connected recovery path | E2E restarts a retained Bot journal, submits Web retry, observes Bot acknowledgement, processes normal no-decision AI output and acknowledges the Scan Range checkpoint through real local HTTP |

Normal BE/E2E setup disables default workspace database fallback and rejects external-network calls. Provider interfaces are injected; SQLite migrations target temporary databases. No live database or deployment was changed.

See [delivery-operations.md](delivery-operations.md) for the two additive migrations, persistent Bot journal, service token, model/provider, detection policy and private review link configuration. The Bot retains the pre-existing fsynced file journal; its difference from ADR-0007's original SQLite queue proposal is documented there.
