# 04: Deployment runbook and operations documentation

**What to build:** An operational runbook document under `docs/operations/deployment-flyio.md` guiding engineers through first-time Fly.io provisioning (CLI auth, volume creation in Tokyo region, setting encrypted secrets like NVIDIA API key and Discord tokens), GitHub Secret registration (`FLY_API_TOKEN`), runtime logs inspection, and zero-downtime rollback procedures.

**Blocked by:** 03 (GitHub Actions CI/CD pipeline)

**Status:** ready-for-agent

- [ ] Documentation clearly outlines prerequisites (`flyctl` installation and login).
- [ ] Detailed commands provided for creating the persistent volume in region `nrt`.
- [ ] Comprehensive list of all required environment variables and secrets (NVIDIA API key, Discord bot token, Auth secret, etc.) with `fly secrets set` examples.
- [ ] Step-by-step instructions for generating and adding `FLY_API_TOKEN` to GitHub repository secrets.
- [ ] Operational troubleshooting guidelines for inspecting container logs (`fly logs`) and executing remote console commands (`fly ssh console`).
