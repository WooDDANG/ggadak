# Fly.io backend deployment

Use the Fly.io web dashboard to create and manage the app. Connect the repository on the app's Deployments page, then use the dashboard's deploy button or enable automatic deployment there if available. GitHub Actions runs backend checks only; it does not deploy the app.

The repository supplies the Dockerfile and `fly.toml`. Configure the app name to match your Fly.io app, region `nrt`, port `3001`, and a 1 GB volume named `ggaddak_data` mounted at `/data`. The backend uses SQLite on that volume. Run only one Machine: Fly volumes belong to individual Machines and SQLite is not shared storage.

In the app dashboard, configure the secrets required by your setup: `NVIDIA_API_KEY`, `DISCORD_BOT_TOKEN`, `BOT_SERVICE_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, and `AUTH_SECRET`. Use a random `AUTH_SECRET` of at least 32 characters and a separate strong service token. OAuth credentials are needed for Discord web login; the NVIDIA key is needed when using NVIDIA. Set the redirect URI to the actual configured callback URL.

The container applies Prisma migrations before starting the BE and Discord Bot. The Bot connects to `http://127.0.0.1:3001`; the BE and Bot share `BOT_SERVICE_TOKEN`. Bot analysis delivery and guild-access journals are stored under `/data` beside SQLite and survive Machine restarts. Existing volume data is retained; do not replace or format the volume during deployment.

Auto-stop is disabled so the Bot can keep its Discord connection and the BE can process queued analysis without incoming HTTP requests. The Machine therefore runs continuously and may consume the trial allowance or incur charges; check the organization's Billing / Trial Status. Check Machine health and logs in the dashboard; `/health` returns `{"status":"healthy"}` once the BE starts, but does not confirm Discord connectivity. Confirm the Bot's ready log and Discord status separately. If either process exits, the container exits so Fly can restart it.

Before schema changes, take an application-consistent SQLite backup and check the volume backup policy. When rolling back, select a known-good release through the dashboard if available. Ensure its database schema is compatible, or restore the corresponding database backup. A single SQLite volume does not guarantee zero-downtime deployment.

Dashboard controls can vary by app configuration; see Fly.io's [dashboard deployment announcement](https://community.fly.io/t/deploy-from-ui-with-one-click-and-previous-ui-deployments-page/21905) and [automatic deployment announcement](https://community.fly.io/t/auto-deploy-on-push-to-github/22306) for the repository connection flow.
