# Context Map

## Contexts

- [Bot](./apps/bot/CONTEXT.md) — Discord bot daemon monitoring channel messages, extracting decisions via LLM, and dispatching webhook payloads to the BE
- [BE](./apps/be/CONTEXT.md) — Backend API server and database that ingests decision webhooks from the Bot and provides REST/GraphQL APIs for the FE
- [FE](./apps/fe/CONTEXT.md) — Frontend web dashboard providing decision timelines, full-text search, and team analytics
- [Shared](./packages/shared/CONTEXT.md) — Shared domain entities, Zod validation schemas, and API contract types

## Relationships

- **Bot → BE**: Bot pushes structured `Decision Payload` objects to BE via HTTP POST (`/api/webhooks/decisions`)
- **FE ↔ BE**: FE queries BE for decision lists, timelines, and search results via REST API (`/api/decisions`)
- **Bot, BE, FE ↔ Shared**: All applications import common TypeScript interfaces and Zod schemas from `@ggaddak/shared`
