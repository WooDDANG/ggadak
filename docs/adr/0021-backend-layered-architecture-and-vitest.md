# Backend Layered Architecture, Clean Responsibilities, and Unified Vitest Tooling

Status: accepted (design agreed; implementation scheduled after v1 model renewal)

## Context

The backend service (`apps/be`) evolved rapidly alongside the v1 API and model renewal. However, the architectural boundaries between Controller, Service, Repository, and DTO layers became blurred:
1. `Service` files declared inline DTO types and filters (`QueryDecisionsFilter`, `AnalyzeDiscussionParams`), causing tight coupling and cyclic dependency risks.
2. The `Repository` layer was burdened with domain business validations (preventing edits on `Superseded`/`Rejected` records, validating alternative IDs, checking optimistic locking versions) and directly consumed API DTOs (`DecisionEditDto`) with Zod parsers, inverting the architectural dependency hierarchy.
3. Repositories duplicated Prisma connection and transaction wrapping boilerplate without a shared foundation.
4. Testing infrastructure relied on Node.js native test runner (`node:test`) with tests scattered across `src/`, complicating test isolation, mock tooling, and unified monorepo test coverage.

## Decision

1. **Standard Layered Boundary (Controller -> Service -> Repository -> Database)**:
   - **Controllers**: Handle HTTP routing, security guards (Guild authorization), DTO input validation via TSOA/Zod, and response envelope mapping.
   - **Services**: Own domain business logic, state transition constraints, optimistic locking decisions, and orchestration. Services operate purely on domain models and DTO contracts.
   - **Repositories**: Must not know about HTTP DTOs or Zod parsers. Repositories receive pure domain entities or primitive database parameters and execute queries and transactions.

2. **Base Repository Abstraction**:
   - Introduce `BaseRepository` to centralize PrismaClient lifecycle, transaction context propagation (`withTransaction`), and common Prisma error translation (e.g., P2002/P2025 into domain `ConflictError`/`NotFoundError`).

3. **Package Manager and Formatting Consolidation**:
   - Commit strictly to `npm` workspaces. Remove leftover `pnpm-workspace.yaml`.
   - Exclude generated code (TSOA routes/specs, Orval API clients) from Prettier/ESLint to eliminate formatter noise.

4. **Unified Vitest Runner and Test Directory Isolation**:
   - Migrate from `node:test` to `vitest` across the monorepo for seamless TypeScript/ESM execution and Vite ecosystem alignment.
   - Separate test suites from production source code: relocate backend unit/integration tests to `apps/be/tests/` and end-to-end suites to `tests/e2e/`.

5. **Discussion Pipeline Preservation**:
   - Preserve existing `POST /api/discussions/analyze` endpoints and contracts to avoid breaking Discord Bot integration until a formal extraction redesign is scheduled.
