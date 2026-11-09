# 03: GitHub Actions CI/CD pipeline

**What to build:** An automated continuous integration and continuous deployment workflow using GitHub Actions (`.github/workflows/deploy-backend.yml`) that triggers on pushes to the `main` branch affecting backend and shared code, validates code quality (type checks, builds, tests), and deploys cleanly to Fly.io using `superfly/flyctl-actions` with remote builders.

**Blocked by:** 02 (Fly.io infrastructure configuration)

**Status:** ready-for-agent

- [ ] `.github/workflows/deploy-backend.yml` triggers on push to `main` with path filters for `apps/be/**`, `packages/shared/**`, `Dockerfile`, `fly.toml`, and the workflow file itself.
- [ ] Workflow steps install dependencies via `npm ci` and run type checks on `@ggaddak/be`.
- [ ] Flyctl action step sets up `flyctl` and initiates `flyctl deploy --remote-only` using the `FLY_API_TOKEN` secret.
- [ ] Concurrent deployments are queued or cancelled gracefully using workflow concurrency groups.
