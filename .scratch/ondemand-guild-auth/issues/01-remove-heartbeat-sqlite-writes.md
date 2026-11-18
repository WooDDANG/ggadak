# 01: Remove heartbeat SQLite writes and isolate liveness in memory

**What to build:** Eliminate heavy SQLite write transactions for transient bot heartbeat events in the backend, handling heartbeat observations exclusively in Node.js runtime memory so that database single-writer locks are never held by heartbeat telemetry.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Heartbeat events received at `POST /api/v1/internal/guild-access/events` do not execute SQLite update queries against `GuildAccessControl`.
- [ ] Bot liveness and lease expiration timestamps are maintained safely in-memory within `GuildAccessService`.
- [ ] Receiving heartbeats while simultaneous database operations are running incurs zero database write locks.
- [ ] Heartbeat API responses continue returning expected sequence acknowledgments to the bot without regressions.
