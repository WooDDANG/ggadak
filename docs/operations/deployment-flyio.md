# Fly.io backend deployment

## First setup

Install `flyctl`, authenticate with `fly auth login`, and create the app named in `fly.toml` if it does not exist:

```sh
fly apps create ggaddak-backend
fly volumes create ggaddak_data --app ggaddak-backend --region nrt --size 1
```

The app uses a single SQLite volume in Tokyo. Do not scale it to multiple Machines: Fly volumes are local to one Machine and SQLite is not shared storage.

Set secrets without committing them:

```sh
fly secrets set --app ggaddak-backend \
  NVIDIA_API_KEY='…' \
  DISCORD_BOT_TOKEN='…' \
  DISCORD_CLIENT_ID='…' \
  DISCORD_CLIENT_SECRET='…' \
  DISCORD_REDIRECT_URI='https://ggaddak-backend.fly.dev/' \
  AUTH_SECRET='…' \
  BOT_SERVICE_TOKEN='…'
```

Generate `AUTH_SECRET` with a cryptographically random value of at least 32 characters. Use a distinct strong `BOT_SERVICE_TOKEN`. If Discord web login is not used, the OAuth secrets may be omitted; configure the bot token and service token for bot-backed analysis. `NVIDIA_API_KEY` is required when `AI_PROVIDER=nvidia` (the default). Configure AGY credentials according to the AGY runtime before selecting `AI_PROVIDER=agy`.

Create a GitHub Actions deploy token with access to this Fly app, then add it as the repository Actions secret `FLY_API_TOKEN` under **Settings → Secrets and variables → Actions**. Pushes to `main` that touch backend, shared, container, or deployment files run checks and deploy with the remote builder. The workflow serializes deploys.

## Deploy and operate

```sh
fly deploy --app ggaddak-backend --remote-only
fly status --app ggaddak-backend
fly logs --app ggaddak-backend
fly ssh console --app ggaddak-backend
```

The image runs Prisma migrations against `/data/decisions.sqlite` before starting Express. `GET /health` returns `{"status":"healthy"}` after the process starts. Scale-to-zero can make the first request wait for a Machine to start.

Before schema changes, take an application-consistent SQLite backup and confirm the volume snapshot/backup policy. To roll back an image, deploy a known-good release with `fly releases`, then run `fly deploy --image <known-good-image> --app ggaddak-backend`. Database migrations must remain backward compatible with the image being restored; restore a database backup before rolling back an incompatible migration.

## Troubleshooting

- Inspect recent logs with `fly logs --app ggaddak-backend` and check Machine health with `fly status`.
- Use `fly ssh console --app ggaddak-backend`, then verify `/data` is mounted and inspect `DATABASE_URL` without printing secret values.
- Migration failures stop startup. Check that the volume is attached and writable, and inspect the migration error before restarting.
- A health check failure may be an application startup or database readiness failure. The `/health` response alone does not prove that AI credentials or Discord OAuth are configured.
- Keep `fly.toml` at one Machine for SQLite. A second Machine cannot safely mount the same volume for concurrent writes.
