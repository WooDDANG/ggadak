# 03: Streamline bot event reporting and relax heartbeat frequency

**What to build:** Optimize the bot daemon by removing the aggressive 10-second heartbeat loop, ensuring the bot communicates with the backend purely upon actual Discord lifecycle changes (`guild_remove`, `member_remove`, initial startup sync) or at an ultra-low frequency heartbeat, eliminating network noise and redundant polling.

**Blocked by:** 02 (On-demand guild authorization caching and Discord API fallback)

**Status:** ready-for-agent

- [ ] Aggressive 10-second heartbeat timer in `apps/bot` is removed or relaxed to an ultra-low frequency.
- [ ] Bot startup continues to send an initial connection snapshot to sync monitored guilds cleanly.
- [ ] Real membership revocations and guild removals continue to dispatch immediate events to the backend.
- [ ] Network traffic and background server log noise between bot and backend drop to near zero during idle periods.
