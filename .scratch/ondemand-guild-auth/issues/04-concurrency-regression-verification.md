# 04: Concurrency regression verification under 1-CPU constraints

**What to build:** An automated integration test verifying that concurrent bot telemetry and user session writes complete under 1-CPU SQLite constraints without 5-second timeouts, lock contention, or HTTP 409 errors.

**Blocked by:** 03 (Streamline bot event reporting and relax heartbeat frequency)

**Status:** ready-for-agent

- [ ] Automated concurrency test simulates simultaneous user authentication session writes and bot telemetry under a single SQLite connection.
- [ ] Zero database lock timeouts (5-second threshold) or HTTP 409 conflict errors occur across repeated test iterations.
- [ ] User guild verification succeeds whether the bot is active, idle, or temporarily disconnected.
- [ ] All existing test suites (`npm test`) and typechecks (`npm run typecheck`) pass cleanly.
