# Spec: Decision Candidate Extraction Policy, Review Queue, Centralized Config & Modular MVC Architecture

Status: `ready-for-agent`

## Problem Statement

When engineering and product teams collaborate on Discord, critical conclusions regarding project scope, software architecture, target audience, feature sets, and business models are frequently lost in high-velocity chat streams. 

However, allowing an autonomous AI bot to directly record discussions as confirmed decisions without human supervision creates significant risks:
1. **False Positives**: Casual chatter, routine standup updates, meeting scheduling, and directionless brainstorming can be misclassified as project decisions.
2. **Lack of Human Governance**: Teams lose control over what is officially recorded as an agreed decision versus an exploratory idea.
3. **Repeated False Candidates (Re-generation Loop)**: When a reviewer rejects an inaccurate candidate, subsequent channel scans naive to previous rejections repeatedly re-create the same unwanted proposal.
4. **Scattered Configuration**: Harvesting thresholds (context window sizes, debounce timeouts, reaction thresholds) scattered across arbitrary constants make system tuning brittle.
5. **Architectural Clutter**: Monolithic script layouts mix HTTP routing, AI inference, Discord gateway handlers, and database queries in single files, hindering maintainability and testability.

## Solution

An end-to-end, human-in-the-loop decision capture and governance pipeline organized around a clean modular MVC and Event-Driven architecture:

1. **Centralized Policy Configuration**: A single source of truth for all harvesting thresholds (initial scan limits, asymmetric context windows, debounce timeouts, reaction thresholds, and agreement counts) managed centrally and exposed via runtime configuration REST endpoints.
2. **Draft Candidates & Review Queue**: All AI-extracted decisions are saved in a `Draft` state and routed to a dedicated web review queue where team members inspect, edit, confirm (`Decided`), defer (`Deferred`), or reject (`Rejected`) them.
3. **Thread-First & Asymmetric Window Ingestion**: The Discord bot prioritizes native Discord Threads as primary discussion units and captures asymmetric context windows (15 messages preceding a trigger, 5 messages following) while merging overlapping discussion intervals into a unified context block (up to 40 messages).
4. **Rich Decision Metadata**: Captures discarded alternatives and rationale (`alternatives[]`), functional domain tags (`categoryTag`), pivot detection (`isPivot`), and authentic Discord evidence links (`rawEvidence[]`).
5. **5-Branch Existing Decision Comparison**:
   - **New Decision**: Creates a fresh `Draft` card.
   - **Draft Refinement / Modification**: Updates existing `Draft` card.
   - **Continuation of Existing Discussion**: Appends new evidence and transcript links to existing card.
   - **Confirmed Decision Change / Pivot**: Creates new `Draft` with `isPivot: true` and `supersedesId` pointing to previous decision.
   - **Casual Re-affirmation / Mention**: Silently skips creating duplicate cards.
6. **External Feedback Integration (`/피드백입력`)**: Stores mentor, judge, and professor advice as external reference context to inform subsequent team discussion analysis without falsely recording the advice itself as a team decision.
7. **Anti-Recreation Memory**: Hashes the evidence message IDs of deleted or rejected draft candidates to prevent repetitive re-generation of discarded proposals unless new conversational evidence is introduced.
8. **Express MVC Backend Architecture**: Clear separation of concerns with Controllers, Services, Repositories, and Routers utilizing standard Express middlewares (CORS, JSON parser, Morgan logging).
9. **Layered Bot Architecture**: Clear separation between Discord Event Handlers, External API Services, Harvester Services, and Discord Embed Presentation Views.

## User Stories

1. As a team member, I want the bot to automatically detect discussion signals (linguistic consensus patterns, Discord threads, and reaction thresholds) and submit candidate proposals to a review queue, so that decisions are captured without polluting active project records.
2. As a product manager, I want all AI-generated decision candidates created in a `Draft` state, so that a human must review and confirm them before they become official decisions.
3. As a team reviewer, I want to approve, edit, defer, or reject decision candidates in a web review queue, so that our team maintains complete governance over project records.
4. As a reviewer confirming a decision, I want the system to record my user handle as `approvedBy` and set `decisionConfirmedDate` to the approval timestamp, so that ownership and timeline accuracy are preserved.
5. As an engineer, I want all harvesting parameters (window sizes, limits, debounce times, reaction thresholds) managed centrally in a shared configuration module and overridable via environment variables or backend endpoints, so that we can tune policies without code rewrites.
6. As a team member discussing an issue inside a Discord Thread, I want the bot to bundle the entire thread as the primary discussion context, so that threaded conversations are analyzed as a cohesive unit.
7. As a team member chatting in a main channel, I want the bot to harvest an asymmetric context window (15 messages before, 5 messages after) when a signal is detected, so that the preceding debate and concluding remarks are both included.
8. As a developer, I want overlapping context windows from multiple nearby trigger signals merged into a single consolidated batch (up to 40 messages), so that the AI receives non-fragmented transcripts.
9. As a team lead, I want decision cards to record discarded alternatives and their explicit reasons for rejection (`alternatives[]`), so that the team remembers why other options were not selected.
10. As a project manager, I want decision cards categorized by domain tag (`타깃`, `문제정의`, `기능`, `기술`, `BM`, `기타`), so that our decision backlog is organized.
11. As a developer, I want the backend AI to compare new candidates against active confirmed decisions to detect pivots (`isPivot: true`), so that shifts in project direction are highlighted.
12. As a team member receiving feedback from professors or judges, I want to use `/피드백입력` to store external advice, so that it serves as reference context for future team discussions without being misclassified as a decision.
13. As a reviewer rejecting a candidate card, I want the system to remember the rejected evidence message IDs, so that the bot does not repeatedly re-create the same rejected candidate on subsequent scans.
14. As an operator, I want initial channel scans on bot startup to backfill past messages up to a configurable limit (e.g. 50 messages), so that existing channel history is evaluated.
15. As a team member, I want visual Discord emoji feedback (`👀` during active processing, `📝` upon candidate generation, or silent removal on casual chatter), so that bot actions remain transparent and non-intrusive.
16. As a team member, I want to manually react with 📌 to force an immediate discussion extraction, bypassing automatic debouncing.
17. As a web user, I want an expandable accordion on every decision card to view the authentic Discord chat transcript with author handles, timestamps, and reply tags.
18. As an SRE, I want all HTTP and daemon operations logged with structured Winston/Morgan logging in rotating log files.
19. As a monorepo developer, I want shared schemas, types, and configuration contracts shared across bot, backend, and frontend packages.
20. As a backend developer, I want the backend structured in a standard Express MVC architecture (Controllers, Services, Repositories, Routers) with middleware support, so that adding new API capabilities is seamless and idiomatic.
21. As a bot developer, I want Discord bot logic separated into Event Handlers, API Services, Harvester Services, and Embed Views, so that Discord client interactions remain clean and maintainable.
22. As a frontend user, I want filter tabs for Review Queue vs Confirmed Decision Timeline, category tag badges, and one-click action buttons with instant UI updates.

## Implementation Decisions

### 1. Centralized Policy Configuration (`packages/shared` & `apps/be`)
- **Config SSOT**: Exports `HarvestingPolicyConfig` schema with defaults:
  - `initialScanLimit`: 50
  - `contextWindowBefore`: 15
  - `contextWindowAfter`: 5
  - `maxMergedWindow`: 40
  - `reactionThreshold`: 3
  - `debounceMs`: 15000
  - `agreementThreshold`: 2
  - `lookbackDays`: 30
- **Policy REST API**: `GET /api/config/policy` in `apps/be` exposing live configuration to clients.

### 2. Rich Decision Card Schema & State Machine (`packages/shared` & `apps/be`)
- **State Machine**: `DecisionState` supports `Draft`, `Proposed`, `Discussing`, `Decided` (Confirmed), `Deferred`, `Superseded`, and `Rejected`.
- **Extended Fields**:
  - `title`: Concise one-line summary of the decision.
  - `decisionContent`: Concrete agreed decision details.
  - `rationale`: Grounded rationale directly derived from the transcript.
  - `alternatives`: Array of `{ option: string, reason: string }`.
  - `categoryTag`: Enum (`타깃`, `문제정의`, `기능`, `기술`, `BM`, `기타`).
  - `feedbackSourceType`: Optional enum (`교수`, `심사위원`, `팀원`, `인터뷰이`).
  - `feedbackSourceDetail`: Optional string note.
  - `feedbackReceivedDate`: Optional ISO string.
  - `messageCreatedAt`: Discord source message timestamp.
  - `decisionConfirmedDate`: Timestamp when human reviewer confirms the draft.
  - `rawEvidence`: Array of Discord message IDs and URLs.
  - `isPivot`: Boolean flag indicating whether this candidate changes or supersedes an existing decision.
  - `approvedBy`: Handle of reviewer who approved the card.
  - `evidenceHash`: SHA-256 hash of `rawEvidence` message IDs used for anti-recreation filtering.

### 3. Backend Express MVC & Layered Architecture (`apps/be`)
- **Loaders (`src/loaders/`)**:
  - `database.loader.ts`: Database connection and schema migrations.
  - `express.loader.ts`: Middleware stack (CORS, Helmet, JSON parser, Morgan logging, Router mount).
  - `index.ts`: Unified async bootstrapper.
- **DTOs (`src/dto/`)**:
  - `decision.dto.ts`: `QueryDecisionsDto`, `ReviewDecisionDto`, `ResolveConflictDto`, `DecisionResponseDto`.
  - `discussion.dto.ts`: `AnalyzeDiscussionRequestDto`, `AnalyzeDiscussionResponseDto`.
  - `feedback.dto.ts`: `CreateFeedbackDto`, `FeedbackResponseDto`.
  - `checkpoint.dto.ts`: `CheckpointResponseDto`, `SaveCheckpointDto`.
  - `policy.dto.ts`: `PolicyResponseDto`.
- **Models (`src/models/` or `src/repositories/models/`)**:
  - `decision.entity.ts`: Persistent database row schema and entity definitions.
  - `feedback.entity.ts`: External feedback entity.
  - `checkpoint.entity.ts`: Channel checkpoint entity.
- **Mappers (`src/mappers/`)**:
  - `decision.mapper.ts`: Bidirectional conversion between DB rows, Domain Entities, and API DTOs.
  - `feedback.mapper.ts`: Conversion between feedback DB rows and DTOs.
- **Adapters (`src/adapters/`)**:
  - `ai.adapter.ts`: External AI provider abstraction (Gemini 1.5 Flash, OpenAI GPT-4o-mini, Mock).
- **Controllers (`src/api/controllers/`)**:
  - `DecisionController`: List query, webhook ingestion, review transitions (`Confirm`, `Defer`, `Reject`), conflict resolution.
  - `DiscussionController`: Handles `POST /api/discussions/analyze`.
  - `FeedbackController`: CRUD for external feedback.
  - `CheckpointController`: Channel watermark management.
  - `PolicyController`: Exposes `GET /api/config/policy`.
- **Services (`src/services/`)**:
  - `DiscussionService`: Evidence hashing, anti-recreation check, transcript builder, AI extractor invocation, DRAFT creation, pivot detection.
  - `DecisionService`: Review state transitions, query filtering, conflict supersede.
  - `FeedbackService`: External feedback management.
  - `CheckpointService`: Channel checkpoint storage.
  - `PolicyService`: Environment/Default policy resolution.
- **Repositories (`src/repositories/`)**:
  - SQLite persistent storage (`DecisionRepository`) with automatic column migrations, checkpoint tables, external feedback tables, and rejected evidence hash tables.
- **Errors & Middlewares (`src/errors/`, `src/api/middlewares/`)**:
  - `AppError` hierarchy and global `errorHandler` middleware.
- **Router (`src/api/routes/`)**:
  - Express sub-routers unified in `src/api/routes/index.ts`.
- **Server (`src/app.ts` / `src/server.ts`)**:
  - `createApp()` providing configured Express app with loaders.

### 4. Bot Layered & Event-Driven Architecture (`apps/bot`)
- **Views (`src/views/embed.view.ts`)**:
  - `renderCandidateEmbed()`: Rich Embeds with color-coding for pivots, alternatives list, action items, category tag, and decision details.
  - `renderConflictEmbed()` & `renderConflictActionRow()`: Conflict prompt and action buttons.
- **Services (`src/services/`)**:
  - `BackendApiService`: HTTP communication layer with backend AI, review, feedback, checkpoint, and policy endpoints.
  - `HarvesterService`: Thread prioritization, asymmetric before/after window slicing, interval merging.
- **Handlers (`src/handlers/`)**:
  - `MessageHandler`: Message event parsing, consensus regex testing, per-channel debounce timers.
  - `ReactionHandler`: Reaction event parsing, 📌 manual override, threshold counting.
  - `InteractionHandler`: Button clicks (supersede/coexist) and slash commands (`/피드백입력`, `/스캔`).
- **Orchestrator (`src/bot/client.ts`)**:
  - Slim gateway listener connecting events to handlers and services.

### 5. Web Dashboard Review Queue (`apps/fe`)
- **Review Queue Tab**: Displays all `Draft` candidates awaiting review.
- **One-Click Actions**:
  - **Confirm (승인)**: Sets state to `Decided`, records `approvedBy`, assigns `decisionConfirmedDate`.
  - **Defer (보류)**: Sets state to `Deferred`.
  - **Reject (기각/삭제)**: Sets state to `Rejected`, registers evidence hash to anti-recreation storage.
- **Rich Card Presentation**: Category badges, Pivot tags, Alternatives accordion, Raw Discord transcript preview.

## Testing Decisions

### What Makes a Good Test
- Tests verify observable external system behavior at high architectural seams (HTTP REST endpoints, Discord event handling, SQLite query outputs) rather than private implementation details.

### Testing Seams & Test Suites
1. **Shared Domain Unit Tests (`packages/shared/src/schemas.test.ts`)**:
   - Schema validation for `Decision`, `DecisionPayload`, `HarvestingPolicyConfig`, `ExternalFeedback`, and `ReviewAction`.
2. **Backend Server Integration Tests (`apps/be/src/server.test.ts`)**:
   - Tests `POST /api/webhooks/decisions`, `GET /api/decisions`, `POST /api/decisions/:id/review`, `GET /api/config/policy`, `POST /api/feedbacks`, `GET/POST /api/channels/:id/checkpoint`.
3. **Bot Core Unit Tests (`apps/bot/src/bot.test.ts`)**:
   - Tests `DiscussionContextBuilder`, `DecisionExtractor`, `ConflictDetector`, `EgressQueue`, `CONSENSUS_REGEX`.
4. **End-to-End Pipeline Tests (`test/e2e.test.ts`)**:
   - Full flow testing from raw Discord message ingestion -> Backend AI candidate extraction (`Draft`) -> Web review confirmation/rejection -> Anti-recreation rejection memory check -> Confirmed timeline querying.

## Out of Scope

- Multi-tenant Discord bot authentication with OAuth2 token refreshes (Single bot token in `.env` for MVP).
- Real-time WebSocket synchronization across web dashboard clients (REST polling on review queue for MVP).
- Vector embeddings / Semantic search for past decisions (Keyword & topic-based querying for MVP).

## Further Notes

- Monorepo code quality is enforced via unified ESLint Flat Config (`eslint.config.mjs`) and Prettier (`.prettierrc`).
- All changes are continuously validated via `npm run lint && npm test`.
