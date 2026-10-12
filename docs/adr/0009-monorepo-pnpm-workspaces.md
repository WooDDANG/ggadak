# Monorepo Architecture with pnpm Workspaces

Status: superseded by [ADR-0021](./0021-backend-layered-architecture-and-vitest.md). The monorepo now uses npm workspaces.

We use a pnpm workspace monorepo (`apps/bot`, `apps/web`, `packages/shared`) to allow the Discord bot daemon and Web consumer application to share end-to-end type contracts and Zod payload schemas while maintaining independent build and deployment cycles.
