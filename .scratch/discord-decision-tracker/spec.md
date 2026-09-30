# Spec: Boilerplate Elimination via TSOA, Prisma ORM, TypeDI & OpenAPI

Status: `ready-for-agent`

## Problem Statement

As the Decision Tracker backend expanded with rich schemas (alternatives, category tags, pivots, external feedback, review states, anti-recreation hashes), manual boilerplate multiplied across the codebase:
1. **Controller & Route Boilerplate**: Every HTTP endpoint required manual `try-catch` blocks, repetitive `Schema.safeParse(req.body)` calls, error dispatching, and manual Express router wiring.
2. **Database CRUD & SQL Binding Boilerplate**: Low-level SQLite operations required writing raw SQL queries with 20+ positional `?` placeholders, manual table migration loops, and manual `JSON.stringify()` / `JSON.parse()` for structured fields.
3. **Manual Dependency Wiring**: Services, repositories, and controllers had to be manually instantiated and linked in factory functions or loaders.
4. **Lack of Interactive API Documentation**: Front-end developers and bot operators lacked an interactive Swagger UI to inspect request/response contracts and test endpoints.

## Solution

Adopt the proven enterprise stack from `TAMMY (NASA_backEnd)` to eliminate boilerplate while boosting type safety and maintainability:

1. **Decorator-Driven Routing & Validation (`TSOA`)**:
   - Write controllers as clean TypeScript classes annotated with `@Route('api')`, `@Get()`, `@Post()`, `@Body()`, `@Query()`, `@SuccessResponse()`.
   - TSOA automatically generates type-safe Express routes (`src/build/routes.ts`) with runtime payload validation, removing all manual router files and `try-catch` parsing blocks.
2. **Interactive OpenAPI / Swagger Documentation (`swagger-ui-express`)**:
   - TSOA automatically generates `swagger.json` and `swagger.yaml`, served interactively at `/api-docs`.
3. **Declarative Type-Safe ORM (`Prisma ORM with SQLite`)**:
   - Define database models (`Decision`, `ExternalFeedback`, `ChannelCheckpoint`, `RejectedEvidenceHash`) in `prisma/schema.prisma`.
   - Generate full TypeScript Prisma client (`prisma generate`, `prisma db push`) with zero raw SQL strings or manual placeholder indexing.
4. **Dependency Injection Container (`TypeDI` & `reflect-metadata`)**:
   - Annotate domain services with `@Service()`.
   - Connect TSOA with TypeDI via an IoC container (`loaders/ioc.ts`), enabling automatic controller and service instantiation with one-line Mock injection in test suites (`Container.set(AiAdapter, MockAiAdapter)`).
5. **Preserve Complete Domain Governance**:
   - Full fidelity of PM Decision Candidate extraction, Thread prioritization, Asymmetric Harvesting, 5-branch existing decision comparison, Anti-recreation memory, External feedback context injection, and Web Dashboard review queue.

## User Stories

1. As a backend developer, I want to define API routes using TypeScript decorators (`@Route`, `@Get`, `@Post`), so that route registration and runtime schema validation are generated automatically without manual Express router files.
2. As a backend developer, I want database queries executed through a type-safe Prisma client, so that raw SQL strings, migration loops, and manual JSON stringification/parsing are eliminated.
3. As a developer, I want services and repositories wired via TypeDI (`@Service()`), so that dependencies are injected automatically without manual constructor chains.
4. As a developer testing the system, I want to inject mock AI adapters into the TypeDI container (`Container.set(AiAdapter, MockAiAdapter)`), so that unit and integration tests run offline without network costs.
5. As an API consumer or frontend developer, I want an interactive Swagger UI at `/api-docs`, so that I can inspect schemas and test API calls in the browser.
6. As a team member, I want the bot to automatically detect discussion signals (linguistic consensus patterns, Discord threads, and reaction thresholds) and submit candidate proposals to a review queue, so that decisions are captured without polluting active project records.
7. As a product manager, I want all AI-generated decision candidates created in a `Draft` state, so that a human must review and confirm them before they become official decisions.
8. As a reviewer, I want to approve, edit, defer, or reject decision candidates in the web review queue, so that our team maintains complete governance over project records.
9. As a reviewer confirming a decision, I want the system to record my user handle as `approvedBy` and set `decisionConfirmedDate` to the approval timestamp.
10. As an engineer, I want all harvesting parameters (window sizes, limits, debounce times, reaction thresholds) managed centrally in `@ggaddak/shared/config.ts` and overridable via environment variables.
11. As a team member chatting in Discord, I want native Thread discussions harvested as primary discussion units, and regular channels harvested with asymmetric context windows (15 before / 5 after).
12. As a team member receiving feedback from professors or judges, I want to use `/피드백입력` to store external advice as reference context.
13. As a reviewer rejecting a candidate card, I want the system to remember the rejected evidence message IDs in `RejectedEvidenceHash`, so that unwanted cards are never re-generated.
14. As an operator, I want security headers (`helmet`) and rate limiting (`express-rate-limit`) enabled on all API routes.
15. As an SRE, I want structured Winston and Morgan logging for all operations.

## Implementation Decisions

### 1. TSOA Routing & Swagger (`apps/be`)
- **Config**: `tsoa.json` configuring controller entry paths, routes output destination (`src/build/routes.ts`), and Swagger output destination (`src/build/swagger.json`).
- **IoC Integration**: `loaders/ioc.ts` linking TSOA controller resolution with TypeDI `Container.get()`.
- **Controllers**:
  - `DecisionController` (`@Route('api/decisions')`)
  - `DiscussionController` (`@Route('api/discussions')`)
  - `FeedbackController` (`@Route('api/feedbacks')`)
  - `CheckpointController` (`@Route('api/channels')`)
  - `PolicyController` (`@Route('api/config')`)
- **Swagger Serving**: `swagger-ui-express` mounted at `/api-docs`.

### 2. Prisma ORM (`apps/be`)
- **Schema**: `prisma/schema.prisma` with datasource SQLite (`DATABASE_URL="file:./decisions.sqlite"`):
  - `model Decision`: fields for id, topic, title, decision, decisionContent, rationale, alternatives, categoryTag, actionItems, state, supersedesId, isPivot, approvedBy, decisionConfirmedDate, feedbackSourceType, feedbackSourceDetail, feedbackReceivedDate, rawEvidence, evidenceHash, rawTranscript, source, messageCreatedAt, createdAt.
  - `model ExternalFeedback`: fields for id, source, detail, content, channelId, createdAt.
  - `model ChannelCheckpoint`: fields for channelId (PK), lastMessageId, updatedAt.
  - `model RejectedEvidenceHash`: fields for evidenceHash (PK), rejectedAt.
- **Repository**: `DecisionRepository` refactored to use `PrismaClient` with type-safe queries.

### 3. TypeDI Dependency Injection (`apps/be`)
- `reflect-metadata` imported at application root.
- Domain services (`DecisionService`, `DiscussionService`, `FeedbackService`, `CheckpointService`, `PolicyService`) annotated with `@Service()`.
- `AiAdapter` registered in TypeDI container.

### 4. Loaders Architecture (`apps/be/src/loaders/`)
- `logger.ts`: Winston structured logger.
- `prisma.ts`: PrismaClient initialization and connection.
- `ioc.ts`: TypeDI IoC container registration for TSOA.
- `express.ts`: Helmet, RateLimiter, CORS, JSON parser, Morgan logging, TSOA generated routes (`RegisterRoutes(app)`), Swagger UI, and global `errorHandler`.
- `index.ts`: Unified async bootstrapper.

## Testing Decisions

### What Makes a Good Test
- Tests verify observable external API contracts and business invariants through HTTP endpoints and Discord interactions, rather than testing internal private variables.

### Testing Seams
1. **Shared Schemas (`packages/shared/src/schemas.test.ts`)**: Shared domain contracts.
2. **Backend Express API Integration (`apps/be/src/server.test.ts`)**: HTTP integration tests against TSOA routes, Prisma persistence, and review workflow.
3. **Bot Core Unit Tests (`apps/bot/src/bot.test.ts`)**: Context building, consensus detection, egress queue, and conflict detection.
4. **End-to-End Pipeline (`test/e2e.test.ts`)**: Full pipeline from Discord message harvest -> TSOA AI extraction -> Web review confirmation/rejection -> Prisma persistence.

## Out of Scope

- Multi-tenant database partitioning (Single SQLite database for MVP).
- Full GraphQL API layer (REST + OpenAPI/Swagger is the standard).

## Further Notes

- Run `npm run swagger` or `npm run build` to generate TSOA routes and OpenAPI specs.
- Run `npm run db:push` to sync Prisma schema with SQLite.
