# 02: Fly.io infrastructure configuration

**What to build:** Complete Infrastructure-as-Code specification via `fly.toml` for deploying the backend to Fly.io in Tokyo region (`nrt`), mounting a 1GB NVMe persistent volume at `/data` to preserve the SQLite database across restarts and deployments, mapping port 3001 with automatic TLS, and configuring zero-downtime healthchecks and scale-to-zero settings.

**Blocked by:** 01 (Container build and volume setup)

**Status:** ready-for-agent

- [ ] `fly.toml` is created at the repository root defining app name, primary region `nrt`, and internal port 3001.
- [ ] `[mounts]` section correctly maps persistent volume `ggaddak_data` to destination `/data`.
- [ ] HTTP service is configured with `auto_stop_machines = "stop"`, `auto_start_machines = true`, and `min_machines_running = 0` (or 1 depending on cold-start preference).
- [ ] HTTP health check points to path `/health` with appropriate grace periods and timeouts.
- [ ] Configuration validates without syntax errors using `fly config validate`.
