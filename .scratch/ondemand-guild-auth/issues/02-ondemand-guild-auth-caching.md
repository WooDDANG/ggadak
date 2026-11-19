# 02: On-demand guild authorization caching and Discord API fallback

**What to build:** An on-demand guild permission verification mechanism that caches verified user guild memberships in memory for 5 minutes, querying the Discord REST API authoritatively only when cached permissions are missing, expired, or invalid.

**Blocked by:** 01 (Remove heartbeat SQLite writes and isolate liveness in memory)

**Status:** ready-for-agent

- [ ] In-memory cache layer stores verified guild memberships and roles with a 5-minute TTL per user and guild.
- [ ] Repeated user requests to authorized endpoints (e.g., Review Queue, dashboard) within TTL return instantaneously without dispatching outbound Discord API requests.
- [ ] Cache misses or expired entries trigger an on-demand fallback query to the Discord REST API to refresh cached permissions.
- [ ] Genuine lifecycle push events (`guild_remove`, `member_remove`) immediately invalidate the affected in-memory cache entries.
