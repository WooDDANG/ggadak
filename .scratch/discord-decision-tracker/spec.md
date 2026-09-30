# Spec: Full-Stack Decision Tracker with Multi-Anchor Dense Embedding, Governance Rubric & Silent Discord Pipeline

Status: `ready-for-agent`

## Problem Statement

Engineering and product teams conduct critical architectural, technical, and scope discussions asynchronously across Discord channels. However, tracking these decisions reliably faces severe pain points:
1. **Keyword Rigidity & False Negatives**: Natural agreement statements (e.g., *"이쪽 아키텍처로 가닥 잡고 진행합시다"*, *"결제 모듈은 MVP에서 빼고 갑시다"*) lack literal keyword matches and are completely missed by traditional regex filters.
2. **Channel Message Pollution**: Chatty bots that post large embeds and confirmation buttons directly into discussion channels disrupt team flow and cause notification fatigue.
3. **API Rate Limiting & Compute Cost**: Invoking generative cloud LLMs (Gemini / OpenAI) on every chat message leads to rate limit errors (HTTP 429/503), latency, and high operational costs.
4. **Vague Rationales & Governance Gaps**: Informal consensus often lacks explicit rationales, rejected alternatives, or clear action item assignees, making past decisions hard to audit or pivot from.

## Solution

A **Multi-Tier Hybrid Decision Tracking Architecture**:

1. **Tier 1 — Discord Bot (`apps/bot`)**:
   - **Multi-Anchor Dense Embedding Scorer**: Evaluates messages against 20 curated decision anchor templates across technical, functional, architecture, and consensus domains. Triggers candidate extraction when `max(cosine_similarity) >= 0.70`.
   - **Formula-Based Discussion Consensus Scorer**: Direct in-bot calculation of consensus metrics (participant count, emoji reaction count, conversation length, and consensus keyword density) on a 1.0 to 4.0 scale.
   - **Silent / Zero-Spam Mode**: Completely removes channel embed message posting. Provides non-intrusive feedback strictly via status emoji reactions (`👀` analyzing ➔ `📝` candidate registered in Review Queue).
   - **Ephemeral Slash Commands**: `/스캔` and `/피드백입력` deliver private status responses (`ephemeral: true`) only to the invoking user.

2. **Tier 2 — Backend Engine & Governance Core (`apps/be`)**:
   - **TSOA + Prisma + TypeDI Architecture**: High-speed, type-safe REST API with automatic Swagger UI (`/api-docs`).
   - **30-Minute Idle Gap Session Slicing**: Slices continuous message streams into coherent distinct sessions.
   - **Anti-Recreation Rejected Evidence Hash**: Prevents re-generating previously rejected candidate cards unless explicitly overridden by `📌` or manual `/스캔`.
   - **Multi-Provider AI Extraction**: Google Gemini 2.5 Flash (`models/gemini-2.5-flash`) with structured JSON output, backed by OpenAI GPT-4o-mini and an automated Dynamic Heuristic Fallback parser.
   - **4-Tier Governance Rubric**: Evaluates multi-participant consensus, rationale clarity, and action items (4.0 Strong, 3.0 Standard, 2.0 Weak, 1.0 Incomplete).
   - **Conflict & Pivot Detection**: Automatically identifies superseded decisions and tags `isPivot: true`.

3. **Tier 3 — PM Web Dashboard (`apps/fe`)**:
   - Hosted at `http://localhost:3000` (Vite + React 18 + Tailwind CSS + TanStack Query).
   - **Review Queue**: Real-time triage interface displaying 4.0 governance score badges, rationale, rejected alternatives, and action items with one-click Confirm/Reject actions.
   - **Decision Timeline & Tree**: Chronological audit trail with state, category, and pivot history filters.
   - **External Feedback Board**: Centralized store for professor, judge, and customer interview inputs.

---

## User Stories

1. As a developer discussing architecture in Discord, I want the bot to detect natural consensus phrasing using multi-anchor dense text embeddings, so that valid decisions are never lost even without exact keywords.
2. As a team member, I want the bot to evaluate decision similarity locally against 20 curated anchors with a `>= 0.70` threshold, so that casual chatter is ignored without calling expensive generative LLMs.
3. As a developer, I want the bot to calculate discussion consensus scores (1.0~4.0) based on participant diversity and emoji reactions in Discord, so that consensus strength is preserved before backend analysis.
4. As a channel participant, I want the bot to operate in silent mode without posting embed cards into our chat, so that our team discussion remains clean and focused.
5. As a channel participant, I want to see a `👀` emoji while the bot processes a discussion and a `📝` emoji when it is registered, so that I have clear, non-intrusive feedback.
6. As a team member, I want to react with `📌` on any message to trigger an immediate, non-debounced decision extraction override.
7. As a team member, I want to run `/스캔` with private responses (`ephemeral: true`), so that scan progress does not notify other channel members.
8. As a team member, I want to record professor or judge advice using `/피드백입력`, so that the AI automatically injects external feedback into future decision extraction prompts.
9. As a product manager, I want all extracted decision candidates presented in a web Review Queue in `Draft` state, so that I can review and confirm them before they become official.
10. As a product manager, I want each candidate card to display its 4-tier governance score badge (`/4.0`), so that I can instantly judge the strength of team consensus.
11. As a product manager, I want to view extracted rationales, rejected alternatives, and action item assignees on the card, so that decision context is fully transparent.
12. As a reviewer confirming a decision, I want the system to record my name in `approvedBy` and set `decisionConfirmedDate` to the current timestamp.
13. As a reviewer rejecting a candidate card, I want the system to store its `evidenceHash` in `RejectedEvidenceHash`, so that unwanted cards are never re-created from the same discussion.
14. As a developer modifying an existing decision, I want the system to detect topic conflicts with active decisions and automatically flag the new candidate as a Pivot (`isPivot: true`).
15. As a product manager, I want to browse the Decision Timeline view with category and state filters, so that I can trace product evolution and team agreements.
16. As a developer working offline or during API rate limits, I want the backend to seamlessly fallback to a dynamic heuristic parser, so that development and testing are never blocked.
17. As an API consumer, I want an interactive Swagger UI at `/api-docs`, so that I can inspect schemas and test API endpoints directly.
18. As a frontend user, I want optimistic UI updates when confirming or rejecting decisions, so that state transitions feel instantaneous.
19. As an engineer, I want all harvesting parameters (context window before/after, debounce delay, reaction threshold) centrally configured in `@ggaddak/shared`, so that policies are unified.
20. As a DevOps engineer, I want the frontend running on port 3000 and the backend on port 3001 with proxy routing, so that local development operates smoothly.

---

## Implementation Decisions

### 1. Multi-Anchor Dense Embedding Evaluator (`@ggaddak/shared/src/semantic-scorer.ts`)
- Pre-computes normalized feature vectors for 20 curated decision anchors across 4 domains (Technical/DB, Architecture, Feature Scope/Pivot, Team Consensus).
- Feature extraction combines word unigrams, compact character n-grams (2-gram, 3-gram), and core morpheme stem weighting (`결정`, `확정`, `합의`, `채택`, `도입`, `진행`, `우선`, `가닥`, `못박`, `제외`).
- Non-linear cosine scaling ensures decision expressions yield `0.70 ~ 0.95`, while casual chatter yields `< 0.40`.
- Exposes `evaluateDenseMultiAnchorSimilarity(text: string, threshold = 0.70): SemanticMatchResult`.

### 2. Discussion Score Formula (`@ggaddak/shared/src/score.ts`)
- `calculateDiscussionScore({ participantCount, reactionsCount, messageCount, hasConsensusKeyword })`:
  - 4.0 (Strong): 2+ participants, 2+ reactions, 3+ messages (or consensus keyword).
  - 3.0 (Standard): 2+ participants or 2+ reactions.
  - 2.0 (Weak): 1 participant with minimal reaction or keyword.
  - 1.0 (Incomplete): Single message or isolated chatter.

### 3. Discord Bot Harvester & Silent Trigger (`apps/bot`)
- `MessageHandler`: Listens on `messageCreate`, runs `evaluateDenseMultiAnchorSimilarity`. If `maxSimilarity >= 0.70` or `CONSENSUS_REGEX` matches, attaches `👀` and schedules debounced harvest.
- `ReactionHandler`: Listens on `messageReactionAdd`, triggers immediate override on `📌` or when reaction count reaches threshold.
- `DiscussionHarvester`: Gathers 15 messages before, trigger message, and 5 messages after (or full thread history). Packages `rawMessages` with metadata (`reactionCount`, `reactions`, `isTrigger`) and transmits `score`, `participantCount`, `reactionsCount` to `POST /api/discussions/analyze`.
- Removes `sendableChannel.send(...)` public embed calls. On backend success, switches `👀` to `📝`.

### 4. Backend Architecture & Extraction Core (`apps/be`)
- **TSOA Controllers**:
  - `DiscussionController`: `POST /api/discussions/analyze`
  - `DecisionController`: `GET /api/decisions`, `POST /api/decisions/{id}/review`, `POST /api/decisions/conflict`, `POST /api/webhooks/decisions`
  - `FeedbackController`: `GET /api/feedbacks`, `POST /api/feedbacks`
  - `PolicyController`: `GET /api/config/policy`
- **Session Slicer (`DecisionExtractorCore`)**: Splits messages by 30-minute idle gap.
- **AiAdapter**: Calls Google Gemini 2.5 Flash with structured JSON output (`ExtractionResultSchema`). Falls back to OpenAI GPT-4o-mini, then to Dynamic Heuristic Fallback parser.
- **Governance Scoring**: Combines Discord-calculated score, rationale length, and action items.

### 5. Frontend Dashboard (`apps/fe`)
- Vite dev server running on `http://localhost:3000`, proxying `/api` requests to `http://localhost:3001`.
- TanStack Query with 5-second polling and optimistic cache updates for review actions (`confirm`, `reject`, `defer`).

---

## Testing Decisions

- **Primary Seams**:
  - `evaluateDenseMultiAnchorSimilarity` and `calculateDiscussionScore` unit tests in `@ggaddak/shared/src/schemas.test.ts`.
  - `DiscussionExtractorCore` session slicing and governance rubric tests in `apps/be/src/engine/extractor-core.test.ts`.
  - `DiscussionHarvester` context window, in-flight locking, and semantic message handling tests in `apps/bot/src/bot.test.ts`.
  - Full pipeline integration test in `test/e2e.test.ts` (Discord Messages ➔ Bot Embedding & Scorer ➔ Backend AI Core ➔ DB ➔ Review Queue).
- **Good Test Criteria**: Test observable behavior against realistic Korean/English team dialogues, state transitions, anti-recreation hash verification, and governance scoring.

---

## Out of Scope

- Audio voice-channel live transcription.
- Third-party Vector DB cluster hosting (e.g. Pinecone/Qdrant) — in-process precomputed vector array is sufficient for 20+ anchors.
- Automated code pull request generation from action items.

---

## Further Notes

- Full test suite passes across all packages via `npm run build && npm test`.
- All Git commits pushed to `origin/main`.
