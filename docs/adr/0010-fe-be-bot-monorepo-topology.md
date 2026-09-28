# FE, BE, and BOT 3-Tier Monorepo Topology

We split the system into three dedicated applications (`apps/fe`, `apps/be`, `apps/bot`) and a shared library (`packages/shared`):
- `apps/bot`: Discord bot daemon collecting discussions and extracting decisions.
- `apps/be`: Backend API and database service receiving webhooks from the Bot and serving queries to the FE.
- `apps/fe`: Frontend web client rendering decision timelines and search.
- `packages/shared`: Shared TypeScript types and Zod schemas.

This clear separation of concerns isolates Discord Gateway management from web API scaling and frontend rendering.
