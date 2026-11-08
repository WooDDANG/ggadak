# 02: Grafana and Loki Docker Compose Infrastructure

**What to build:**
Create `docker-compose.monitoring.yml` and associated configuration files for Loki and Promtail, mapping Grafana to port 3005 (`GRAFANA_PORT`) and tailing `apps/be/logs/ai-metrics.log`.

**Blocked by:** 01: AI Metrics Structured Logging

**Status:** resolved

- [x] `docker-compose.monitoring.yml` defines `loki`, `promtail`, and `grafana` services
- [x] Promtail configuration reads `apps/be/logs/ai-metrics.log` with JSON parsing
- [x] Grafana binds to port `3005` (configurable via `GRAFANA_PORT`)

## Answer
- Created `docker-compose.monitoring.yml` running Loki (3100), Promtail, and Grafana (port 3005).
- Created `monitoring/loki/loki-config.yml` and `monitoring/promtail/promtail-config.yml` mounting `apps/be/logs` read-only.
- Grafana port configured to `${GRAFANA_PORT:-3005}` avoiding port 3000 conflicts.
