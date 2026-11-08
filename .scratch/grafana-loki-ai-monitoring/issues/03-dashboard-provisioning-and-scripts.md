# 03: Dashboard Provisioning and Monitoring Scripts

**What to build:**
Provide automatic Grafana dashboard provisioning (Loki datasource and AI Metrics dashboard JSON) so `http://localhost:3005` displays charts out-of-the-box, and add `npm run monitoring:up` / `monitoring:down` scripts to root `package.json`.

**Blocked by:** 02: Grafana and Loki Docker Compose Infrastructure

**Status:** resolved

- [x] Automatic datasource provisioning connecting Grafana to Loki
- [x] Pre-built AI Metrics dashboard JSON with call rate, duration timeline (20s alert line), stage distribution, and log table
- [x] Scripts `monitoring:up` and `monitoring:down` added to root `package.json`

## Answer
- Created datasource provisioning connecting Grafana to Loki at `http://loki:3100`.
- Created pre-built dashboard JSON `monitoring/grafana/dashboards/ai-metrics-dashboard.json` with latency timeline, 20s alert threshold line, stage distribution pie chart, and live log stream.
- Added `npm run monitoring:up` and `npm run monitoring:down` commands to root `package.json`.
