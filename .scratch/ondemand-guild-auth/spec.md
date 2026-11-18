# Feature Spec: On-Demand Guild Authorization and Bot Trust Simplification

## Problem Statement

In a constrained single-CPU SQLite deployment (such as Fly.io shared-cpu-1x), the bot daemon sends periodic heartbeat events every 10 seconds to `/api/v1/internal/guild-access/events`. The backend processes these heartbeats by opening write transactions against the SQLite `GuildAccessControl` table to update connection leases. When an interactive web user attempts to authenticate or refresh an OAuth session at the same time, SQLite's single-writer locking causes lock starvation and transaction timeouts (5-second threshold), failing user requests and throwing HTTP 409 conflict errors. Furthermore, running a continuous 10-second heartbeat loop creates unnecessary network chatter and log clutter when real guild membership changes occur only intermittently.

## Solution

Eliminate continuous SQLite transaction writes for heartbeat telemetry. Replace the push-based continuous lease model with an On-Demand, In-Memory Guild Access Verification architecture:
1. Remove periodic SQLite writes from heartbeat telemetry; track runtime liveness in Node.js process memory.
2. Implement an in-memory cache (TTL 5 to 10 minutes) for guild memberships and permissions.
3. When a user requests access, check the in-memory cache first. If a cache miss or invalidated state occurs, query the Discord API on-demand using backend credentials and revalidate.
4. Retain event-driven webhooks strictly for genuine mutations (`guild_remove`, `member_remove`, `guild_change`), eliminating the 10-second background write contention entirely.

## User Stories

1. As a web user accessing the Review Queue, I want my dashboard and session requests to complete without 5-second timeouts, so that I can review decision cards smoothly without encountering spurious 409 or 503 errors.
2. As a server administrator, I want SQLite to be dedicated to durable business records (decisions, candidates, user accounts) rather than transient heartbeat ticks, so that database contention on 1-CPU machines remains zero.
3. As a developer inspecting server logs, I want clean logs devoid of 10-second heartbeat noise, so that meaningful operational errors and AI analysis logs are easy to spot.
4. As a web user logging into a Discord guild, I want my permissions to be verified against an in-memory cache in under 1 millisecond, so that navigation between channels and review queues feels instantaneous.
5. As a security-conscious administrator, I want revoked Discord permissions to take effect within minutes or upon deliberate re-query, so that removed members cannot act on decision records indefinitely.
6. As a backend service, I want to query the Discord REST API directly when cached guild permissions are missing or ambiguous, so that I maintain authoritative access control without relying on an external bot daemon heartbeating every second.
7. As a backend service, I want in-memory cache entries to protect Discord REST API rate limits, so that repeated page reloads from users do not trigger HTTP 429 Too Many Requests errors.
8. As a bot daemon, I want to dispatch Discord events only when guilds or members actually change, so that my background network and CPU footprint are minimized.
9. As a bot daemon recovering from a restart, I want to re-establish initial presence without forcing a heavy SQLite lock cycle on the backend.
10. As a tester executing concurrent stress tests on 1-CPU environments, I want concurrent user logins and bot telemetry to execute reliably with zero deadlocks or timeout errors.

## Implementation Decisions

- **In-Memory Cache Layer**: Introduce an in-memory TTL cache within the backend for verified guild memberships and bot guild presence. No external cache infrastructure (Redis) will be introduced, keeping the architecture single-binary and lightweight.
- **SQLite Write Elimination**: Deprecate periodic write transactions to `GuildAccessControl` on heartbeat events. Heartbeat events will either be converted into memory-only timestamp updates or removed in favor of event-driven notifications.
- **On-Demand Validation Fallback**: When checking guild access (`checkGuildAccess`), if the in-memory cache is missing or expired, the backend initiates an on-demand Discord API call (`/users/@me/guilds` or guild member check) to refresh the cache.
- **Rate Limit Defense**: The in-memory cache retains verified permissions for a configurable duration (default 5 minutes), shielding the Discord API from being hammered by user page navigations.
- **Preserve Event-Driven Push for Mutations**: Instant Discord lifecycle events (`guild_remove`, `member_remove`) remain pushed from bot to backend to invalidate the in-memory cache immediately upon kick or ban.

## Testing Decisions

- **Primary Seam**: The highest integration seams:
  - `AuthService.requireGuild` / `AuthService.checkGuildAccess` (testing permissions with cache hits, cache misses, and fallbacks)
  - `GuildAccessController` (`POST /api/v1/internal/guild-access/events`)
- **Concurrency & Lock-Free Test**: A test scenario reproducing concurrent session writes and bot events under simulated 1-CPU / single-connection SQLite conditions, verifying that zero timeouts or HTTP 409 errors occur.
- **Rate Limiting & Fallback Test**: Verify that repeated guild authorization calls within the cache TTL do not dispatch outgoing Discord HTTP requests, and that cache expiration triggers an on-demand re-fetch.
- **Prior Art**: Existing tests in `apps/be/tests/guild-access.test.ts` and `apps/be/tests/auth.test.ts`.

## Out of Scope

- Introducing external Redis, Memcached, or distributed locks.
- Modifying Discord OAuth2 authentication scopes or login redirect workflows.
- Altering Decision Record extraction or LLM pipeline logic.

## Further Notes

This architectural simplification directly resolves the root cause of the 1-CPU Fly.io timeout while improving overall system clarity.
