# Backend Layered Architecture, Clean Responsibilities, and Unified Vitest Tooling

Status: accepted (implemented)

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
   - Introduce `BaseRepository` to share injected Prisma access, explicit transaction context propagation (`withTransaction`), and opt-in Prisma error classification (e.g., P2002 as `ConflictError`).
   - Keep PrismaClient connect/disconnect lifecycle in the existing BE loader. A repository base class does not own process-level infrastructure lifecycle.
   - Preserve caller-specific meanings for P2025 and conditional version updates: only map P2025 to `NotFoundError` where the operation requires an existing record; stale compare-and-swap updates remain `ConflictError`.

3. **Package Manager and Formatting Consolidation**:
   - Commit strictly to `npm` workspaces. Remove leftover `pnpm-workspace.yaml`.
   - Exclude generated code (TSOA routes/specs, Orval API clients) from Prettier/ESLint to eliminate formatter noise.

4. **Unified Vitest Runner and Test Directory Isolation**:
   - Use Vitest for the backend and end-to-end suites to support TypeScript/ESM execution and shared assertion/mocking tools.
   - Relocate backend unit/integration tests from `apps/be/src/` into `apps/be/tests/`, keeping their layer-based subdirectories. Keep end-to-end tests separately under the repository-root `tests/e2e/` directory.
   - This refactor does not move or change the test runners for Bot, FE, or shared packages.

5. **Discussion Pipeline Preservation**:
   - Preserve existing `POST /api/discussions/analyze` endpoints and contracts to avoid breaking Discord Bot integration until a formal extraction redesign is scheduled.

6. **Decision Edit Atomicity**:
   - Services own edit policy (editable states, alternative identity validation, and interpreting stale versions as conflicts). Repositories retain the atomic conditional write (`id` and expected `version`) so concurrent edits cannot both succeed.
