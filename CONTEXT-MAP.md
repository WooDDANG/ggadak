# Context Map

## Contexts

- [Bot](./apps/bot/CONTEXT.md) — Discord bot daemon harvesting discussion windows, managing debouncing and channel locks, and dispatching discussion context to the BE
- [BE](./apps/be/CONTEXT.md) — Backend API server and database providing centralized preprocessing, AI decision extraction, Review Queue lifecycle, and REST APIs for the FE
- [FE](./apps/fe/CONTEXT.md) — Frontend web dashboard providing decision timelines, full-text search, and team analytics
- [Shared](./packages/shared/CONTEXT.md) — Shared domain entities, Zod validation schemas, preprocessors, and API contract types

## Relationships

- **Bot → BE**: Bot harvests Discussion Context and dispatches it to BE via HTTP POST (`/api/discussions/analyze`) with centralized policy synchronization (`/api/config/policy`)
- **FE ↔ BE**: FE queries BE via REST API (`/api/decisions`) using type-safe React Query clients generated from BE's TSOA OpenAPI specification via Orval (`npm run api:sync`)
- **Bot, BE, FE ↔ Shared**: All applications import common TypeScript interfaces, Zod schemas, filters, and scorers from `@ggaddak/shared`
