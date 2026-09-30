# Spec: Full-Stack Architecture Modernization & Boilerplate Elimination (TSOA, Prisma, TypeDI, discordx, React + TanStack Query)

Status: `ready-for-agent`

## Problem Statement

As the Decision Tracker system grew to encompass rich domain governance (multi-decision extraction, decision pivots, external advice integration, review states, and anti-recreation hashes), substantial boilerplate and cognitive overhead emerged across all three tiers:
1. **Backend (`apps/be`)**: Repetitive Express router wiring, manual `Schema.safeParse(req.body)` calls, manual `try-catch` blocks in controllers, and 200+ lines of raw SQL string bindings with manual JSON serialization in SQLite.
2. **Discord Bot (`apps/bot`)**: A monolithic 600-line client combining Gateway events, slash commands, harvesting algorithms, in-flight locks, and REST API calls, lacking a declarative decorator structure.
3. **Frontend (`apps/fe`)**: A legacy monolithic single-file HTML script lacking component modularity, optimistic caching, and type-safe server state management.

## Solution

Modernize the entire monorepo using enterprise best-practice design patterns (inspired by NASA Architecture standards) to eliminate boilerplate, achieve complete type safety, and establish clear separation of concerns:

1. **Backend Layer (`apps/be`)**:
   - **TSOA Decorator Routing**: Express endpoints defined via `@Route`, `@Get`, `@Post`, `@Body`, `@Query`, `@Path`, with automatic runtime validation and zero manual routing files.
   - **Interactive OpenAPI Documentation**: Swagger UI automatically generated and served at `/api-docs`.
   - **Prisma ORM**: Single source of truth database modeling in `schema.prisma`, replacing manual SQL string concatenation with type-safe Prisma client operations.
   - **TypeDI Dependency Injection**: Automatic IoC lifecycle management and controller resolution via `Container.get()` and `@Service()`.

2. **Discord Bot Layer (`apps/bot`)**:
   - **`discordx` Framework**: Declarative `@Discord()`, `@Slash()`, `@SlashOption()`, `@ButtonComponent()` decorator pattern.
   - **Service Extraction**: Harvesting (`HarvesterService`), channel scanning, and AI extraction orchestration cleanly isolated in `AnalysisService`, leaving `client.ts` as a clean 40-line gateway entry point.

3. **Frontend Dashboard Layer (`apps/fe`)**:
   - **React 18 + Vite + Tailwind CSS + TanStack Query**: Feature-driven architecture (`features/review-queue`, `features/decision-timeline`, `features/feedback-board`) with automatic 5-second polling and optimistic UI mutations for PM review actions.

4. **Preserve Complete Domain Governance**:
   - 100% fidelity of PM Decision Candidate extraction, Thread prioritization, Asymmetric Harvesting, 5-branch existing decision comparison, Anti-recreation rejected evidence memory, and Conflict/Pivot resolution buttons.

## User Stories

1. As a backend developer, I want to define API endpoints using TypeScript decorators (`@Route`, `@Get`, `@Post`), so that route binding and DTO validation are generated automatically without manual Express router files.
2. As a backend developer, I want database operations executed via a type-safe Prisma ORM client, so that raw SQL strings, migration loops, and manual JSON stringification are eliminated.
3. As a backend developer, I want services and controllers wired via TypeDI (`@Service()`), so that dependencies are injected automatically without manual factory constructors.
4. As an API consumer or developer, I want an interactive Swagger UI at `/api-docs`, so that I can inspect schemas and test API calls in the browser.
5. As a bot developer, I want Discord slash commands and button interactions defined using `discordx` decorators (`@Slash`, `@ButtonComponent`), so that event handling and routing are declarative and self-contained.
6. As a bot developer, I want channel harvesting and analysis execution separated into `HarvesterService` and `AnalysisService`, so that the bot entry point remains lean and maintainable.
7. As a product manager, I want all AI-extracted decision candidates presented in a web Review Queue in `Draft` state, so that I can approve (Confirm), defer (Defer), or reject (Reject) proposals with one click.
8. As a product manager, I want optimistic UI updates when confirming or rejecting decisions in the frontend dashboard, so that state transitions feel instantaneous.
9. As a reviewer confirming a decision, I want the system to record my name in `approvedBy` and set `decisionConfirmedDate` to the current timestamp.
10. As a reviewer rejecting a candidate card, I want the system to permanently record the `evidenceHash` in `RejectedEvidenceHash`, so that unwanted cards are never re-generated from the same discussion.
11. As a team member receiving feedback from professors, judges, or interviewees, I want to use `/피드백입력` or the Feedback Board to store external advice as reference context for AI decision extraction.
12. As a team member chatting in Discord, I want consensus keywords (`~합시다`, `결정`, `확정`, `픽스`) to automatically trigger a 3-second debounced context extraction with `👀` reaction indicator.
13. As a team member, I want to react with `📌` on any message to trigger an immediate, non-debounced decision extraction.
14. As an engineer, I want all harvesting parameters (lookback window, debounce delay, reaction thresholds) managed centrally in `@ggaddak/shared/config.ts` and overridable via environment variables.
15. As a frontend user, I want an interactive Decision Timeline view with category and state filters (Decided, Superseded, Deferred, Rejected), so that I can trace the historical evolution and pivots of our product.
16. As an operator, I want security headers (`helmet`) and rate limiting (`express-rate-limit`) active on all backend API routes.
17. As an SRE, I want structured Winston and Morgan logging across all HTTP and bot operations.

## Implementation Decisions

### 1. Backend Architecture (`apps/be`)
- **TSOA**: `tsoa.json` configured with `esm: true`, outputting routes to `src/api/routes/generated/routes.ts` and OpenAPI spec to `src/api/docs/swagger.json`.
- **IoC Module**: `src/loaders/ioc.ts` bridging TSOA's `IocContainer` with TypeDI's `Container.get()`.
- **Controllers**:
  - `DecisionController`: `@Route('api')`, endpoints for `GET /api/decisions`, `POST /api/decisions/{id}/review`, `POST /api/decisions/conflict`, `POST /api/webhooks/decisions`.
  - `DiscussionController`: `@Route('api/discussions')`, endpoint for `POST /api/discussions/analyze`.
  - `FeedbackController`: `@Route('api/feedbacks')`, endpoints for `GET /api/feedbacks` and `POST /api/feedbacks`.
  - `CheckpointController`: `@Route('api/channels')`, endpoints for `GET` and `POST` `/api/channels/{channelId}/checkpoint`.
  - `PolicyController`: `@Route('api/config/policy')`, endpoint for `GET /api/config/policy`.
- **Prisma ORM**: `prisma/schema.prisma` defines models for `Decision`, `ExternalFeedback`, `ChannelCheckpoint`, and `RejectedEvidenceHash`.
- **Repository**: `DecisionRepository` delegates database operations to `PrismaService` while maintaining in-memory caching for ultra-fast offline unit testing.
- **Express Loader**: `src/loaders/express.ts` mounts Helmet, CORS, JSON body parser, Morgan logging, Swagger UI at `/api-docs`, `RegisterRoutes(app)`, and centralized error handling.

### 2. Discord Bot Architecture (`apps/bot`)
- **`discordx` Framework**: Replaces manual interaction listeners with decorator classes.
- **Decorated Modules**:
  - `FeedbackCommand`: `@Discord()`, `@Slash({ name: '피드백입력' })` with `@SlashChoice()` options for '교수', '심사위원', '팀원', '인터뷰이'.
  - `ScanCommand`: `@Discord()`, `@Slash({ name: '스캔' })` for manual channel history harvesting.
  - `ConflictButtonHandler`: `@Discord()`, `@ButtonComponent({ id: /conflict:.*/ })` for one-click Discord embed conflict/pivot resolution.
- **Services**:
  - `AnalysisService`: Manages per-channel in-flight locks, harvests context, invokes backend AI, renders embeds, and handles reaction transitions (`👀` -> `📝`).
  - `HarvesterService`: Thread-first exploration with asymmetric 15/5 window slicing and overlapping interval merging.
  - `BackendApiService`: Type-safe REST client for backend communication.
- **Client**: `DecisionTrackerBot` (`src/bot/client.ts`) slimmed down to 40 lines of initialization logic.

### 3. Frontend Architecture (`apps/fe`)
- **React 18 + Vite + Tailwind CSS**: Modern SPA replacing legacy monolithic HTML.
- **TanStack Query (`@tanstack/react-query`)**: Auto-polling every 5 seconds for decisions and feedbacks, with instant cache invalidation on review actions.
- **Feature Modules**:
  - `ReviewQueue`: PM triage queue with Confirm, Defer, Reject actions and governance compliance score badge.
  - `DecisionTimeline`: Filterable historical timeline with category tags, supersedes links, and Discord jump links.
  - `FeedbackBoard`: External feedback hub for creating and browsing advisor inputs.

## Testing Decisions

### What Makes a Good Test
- Tests verify observable system behavior through HTTP endpoints, Discord event pipelines, and domain state transitions, completely decoupled from internal class private properties.

### Testing Seams
1. **Shared Domain Schemas (`packages/shared/src/schemas.test.ts`)**: Validates Zod runtime schema constraints and payload envelopes.
2. **Backend Server & Ingestion Integration (`apps/be/src/server.test.ts`)**: Tests TSOA routes, review state machine, rate limiting, and Prisma database persistence.
3. **Bot Core Unit Tests (`apps/bot/src/bot.test.ts`)**: Tests transcript context building, consensus regex pattern matching, conflict detection, and egress queue.
4. **End-to-End Monorepo Pipeline (`test/e2e.test.ts`)**: Tests the full end-to-end flow: Discord discussion harvest -> TSOA AI extraction -> Review Queue approval/rejection -> Anti-recreation hash verification -> DB persistence.

## Out of Scope

- Multi-tenant Discord guild isolation (Single tenant / Capstone project team scope for MVP).
- Real-time WebSocket streaming (TanStack Query 5s polling is sufficient and robust).

## Further Notes

- Run `npm run build` to build all workspaces (`shared`, `be`, `bot`, `fe`) and generate TSOA routes and OpenAPI specs.
- Run `npm test` to execute all 18 test suites across the monorepo.
- Backend Swagger UI is available at `http://localhost:3001/api-docs`.
- Frontend Dashboard is served at `http://localhost:3000`.
