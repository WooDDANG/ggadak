# Feature Spec: Fly.io Deployment and GitHub Actions CI/CD Pipeline

## 1. Context and Goals
The GGADDAK backend (`apps/be`) uses Express v5, Prisma v5 with SQLite (`decisions.sqlite`), Python-based schema checking scripts (`storage-database.py`), and NVIDIA NIM API (`nvidia/nemotron-3.5-super-vl-120b-a12b`).
To provide a production-ready, reliable, and automated cloud hosting environment without modifying SQLite database logic, we target Fly.io with Persistent Volumes and automate testing and deployment using GitHub Actions.

## 2. Architecture & Design Decisions
- **Containerization**: Multi-stage Dockerfile based on Node.js 22-slim and Python 3. Ensures monorepo dependencies (`@ggaddak/shared`, `@ggaddak/be`) compile and build cleanly.
- **Database Persistence**: SQLite stored at `/data/decisions.sqlite` on a dedicated Fly.io Persistent Volume (`ggaddak_data`, 1GB).
- **Automatic Migration**: `prisma migrate deploy` executes before server start on volume mount.
- **Infrastructure as Code**: `fly.toml` configures Tokyo region (`nrt`), port 3001, `/health` check, and scale-to-zero capabilities.
- **CI/CD Automation**: GitHub Actions workflow (`deploy-backend.yml`) runs lint/typecheck/tests and triggers zero-downtime remote deploys on `main` push.
- **Security & Secrets**: Secrets (NVIDIA API key, Discord tokens, secrets) injected via Fly.io encrypted secrets.

## 3. Tracer-Bullet Milestones
1. Container runtime and volume entrypoint (`01-container-build-and-volume-setup.md`)
2. Fly.io infrastructure definition (`02-flyio-infrastructure-config.md`)
3. GitHub Actions CI/CD pipeline (`03-github-actions-cicd-pipeline.md`)
4. Deployment runbook and operational checklist (`04-deployment-runbook-and-operations-doc.md`)
