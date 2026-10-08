# ADR 0017: TSOA Code-First OpenAPI Specification and Orval FE Client Codegen

## Status
Accepted

## Context
As the GGADDAK system evolved with multiple backend controllers and frontend integration requirements, maintaining API type safety and avoiding synchronization drift between FE and BE became essential.
Previously:
1. Backend routes and OpenAPI specs were partially handled via TSOA, but FE API clients were manually written, resulting in potential schema mismatches and boilerplate maintenance.
2. The team needed a single source of truth (SSOT) across the monorepo while keeping current backend controllers, TypeDI IoC setup, and domain schemas intact.
3. Although the frontend UI will undergo a full React redesign in the future, establishing an automated API contract generation pipeline now ensures that future frontend refactoring can immediately consume type-safe React Query hooks and DTO interfaces.

## Decision
1. **SSOT Strategy (TSOA Code-First)**:
   - Keep backend TypeScript Controllers and DTO interfaces as the single source of truth for the REST API contract.
   - Generate OpenAPI v3 compliant `swagger.json` in `apps/be/src/api/docs/` and serve Swagger UI at `/api-docs` using `tsoa spec-and-routes`.
2. **Frontend Codegen with Orval**:
   - Adopt **Orval** in `apps/fe` configured to consume `../be/src/api/docs/swagger.json`.
   - Automatically generate TanStack React Query v5 hooks, fetch clients, and TypeScript DTO models under `apps/fe/src/api/generated/`.
3. **Monorepo Automation Chain**:
   - Provide a top-level root script `"api:sync": "npm run swagger --workspace=@ggaddak/be && npm run codegen --workspace=@ggaddak/fe"`.
   - Any backend DTO or controller changes can be propagated to the frontend client in a single command.

## Consequences
- **Positive**: 
  - Complete end-to-end type safety between backend endpoints and frontend data fetching.
  - Zero manual typing needed for new endpoints; React Query hooks (`useGetDecisions`, `useCreateDecision`, etc.) are ready-to-use out of the box.
  - Future React frontend overhaul can build directly on generated hooks without rewriting data fetching layers.
- **Trade-off**: 
  - Requires maintaining the `api:sync` pipeline in CI/CD and developer workflows.
  - TSOA-specific decorators must be applied to all newly exposed backend controllers.
