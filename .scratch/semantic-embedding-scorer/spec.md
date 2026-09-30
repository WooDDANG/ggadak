# Spec: Semantic Text Embedding Decision Scorer & Hybrid Pipeline

Status: ready-for-agent

## Problem Statement

Currently, detecting architectural and product decisions in Discord relying purely on regular expression keyword matching (`CONSENSUS_REGEX`) has two major flaws:
1. **False Negatives & Rigidity**: Natural Korean discussions often express strong consensus without explicit keyword matches (e.g., *"그럼 DB 쪽은 Alex 말대로 Postgres 가는 걸로 못박죠"*, *"기능 범위는 결제 모듈만 먼저 쳐내고 갑시다"*).
2. **LLM Cost & API Throttling**: Querying large generative LLMs (Gemini / OpenAI) on every message creates unnecessary latency and triggers API rate limit / quota exhaustion errors (HTTP 429 / 503).
3. **Channel Message Noise**: Chatty bot responses and embedded candidate cards clutter team discussion channels, causing communication fatigue.

Team members and PMs need a fast, local semantic evaluation layer on Discord that accurately scores decision intent and filters non-decisions before offloading structured extraction (rationale, alternatives, action items) to the backend.

## Solution

A **2-Tier Hybrid Extraction Pipeline**:

1. **Tier 1 — Discord Bot (Semantic Text Embedding + Consensus Scoring)**:
   - Uses lightweight text embeddings to compute cosine similarity against curated **Decision Anchor Vectors** (e.g., tech stack selection, priority consensus, architectural direction).
   - Combines semantic similarity with a fast multi-participant and emoji reaction formula to calculate a 1.0~4.0 discussion consensus score.
   - Operates in complete **Silent Mode**: provides feedback exclusively through status emoji reactions (`👀` during analysis ➔ `📝` on successful review queue registration), sending no chat messages to the channel.

2. **Tier 2 — Backend Core & LLM (Structured Field Extraction & Governance Rubric)**:
   - Ingests the filtered message payload (15 before, trigger, 5 after) along with Discord-calculated scores.
   - Slices conversation by 30-minute idle gaps.
   - Invokes generative LLM to extract structured fields: title, topic, rationale, rejected alternatives, category tag, and action item assignees.
   - Enforces 4-tier governance rubric scoring and registers draft cards directly into the Web Dashboard Review Queue.

---

## User Stories

1. As a developer discussing tech stacks in Discord, I want the bot to understand natural agreement phrases (e.g., *"그럼 이걸로 확정짓고 갑시다"*) without rigid keywords, so that valid decisions are never missed.
2. As a team member, I want the bot to evaluate decision likelihood locally using text embeddings, so that our team doesn't hit backend LLM quota limits on casual chatter.
3. As a developer, I want the bot to calculate discussion consensus scores (1.0~4.0) based on participant diversity and emoji reactions directly in Discord, so that consensus strength is preserved before backend analysis.
4. As a channel participant, I want the bot to remain completely silent without posting embed cards into the chat, so that our team's conversation is not interrupted by bot spam.
5. As a channel participant, I want to see a `👀` emoji reaction while the bot evaluates a message, and a `📝` emoji when it is recorded, so that I have clear, non-intrusive feedback.
6. As a PM, I want the bot to send the full surrounding context (before 15, trigger, after 5 messages) to the backend, so that the LLM has complete context to summarize the decision rationale.
7. As a PM reviewing decisions on the web dashboard (`http://localhost:3000`), I want to see the 4-tier governance score badge and action items on the candidate card, so that I can make an informed confirmation.
8. As a developer running `/스캔` or `/피드백입력`, I want the response to be private (`ephemeral: true`), so that other channel members are not spammed with scan summaries.
9. As a developer testing offline or without live LLM keys, I want a deterministic semantic fallback parser to produce consistent extraction results.
10. As a system architect, I want a single clear seam between the Discord Harvester and the Backend Discussion API, so that bot logic and extraction logic remain completely decoupled.

---

## Implementation Decisions

### 1. Semantic Embedding Scorer Module (`@ggaddak/shared` / `apps/bot`)
- Define curated decision anchor templates representing core decision categories (architecture, tech selection, feature prioritization, scheduling).
- Implement a cosine similarity function between message text vectors and anchor vectors.
- Expose `evaluateSemanticDecision(text: string): { similarity: number; isCandidate: boolean }`.

### 2. Discussion Score Calculation Formula (`@ggaddak/shared`)
- Implement `calculateDiscussionScore` evaluating:
  - Participant count (>= 2 adds +1.0)
  - Reaction count (>= 2 adds +1.0)
  - Context depth (>= 3 messages with consensus keyword/reactions adds +1.0)
- Returns 1.0 (Incomplete), 2.0 (Weak), 3.0 (Standard), 4.0 (Strong).

### 3. Discord Harvester Egress Pipeline (`apps/bot`)
- Capture trigger messages and assemble asymmetric context window: 15 messages before, trigger message, 5 messages after.
- Package `rawMessages` with metadata: `id`, `author`, `content`, `createdAt`, `replyingTo`, `reactionCount`, `reactions`, `isTrigger`.
- Transmit `score`, `participantCount`, and `reactionsCount` in `AnalyzeDiscussionRequestDto`.
- Remove embed posting into Discord channels (`sendableChannel.send(...)`). Use `👀` ➔ `📝` emoji reactions.
- Make slash commands (`/스캔`, `/피드백입력`) return `ephemeral: true`.

### 4. Backend Discussion Controller & Service (`apps/be`)
- Ingest `AnalyzeDiscussionRequestDto` containing Discord pre-calculated score and raw context.
- Slice messages into 30-minute idle gap sessions.
- Call Gemini 2.5 Flash (`models/gemini-2.5-flash`) or dynamic heuristic parser to extract structured decision fields.
- Combine Discord score with rationale length and action items to assign final `governanceScore`.
- Persist candidate into Prisma/Memory repository in `Draft` state and notify Review Queue.

---

## Testing Decisions

- **Seam**: High-level E2E Integration Pipeline (`test/e2e.test.ts`) and Harvester Unit Tests (`apps/bot/src/bot.test.ts`).
- **Good Test Criteria**: Test observable behavior (given Discord discussion messages with reactions, verify that the bot calculates the correct consensus score, sends context without channel spam, and the backend returns structured candidate decisions with accurate governance scores).
- **Prior Art**: `apps/be/src/engine/extractor-core.test.ts` and `packages/shared/src/schemas.test.ts`.

---

## Out of Scope

- Client-side full vector database indexing (e.g. Pinecone/Chroma integration on bot) — lightweight embedding similarity with anchor vectors is sufficient for 1st-stage filtering.
- Automated PR creation or GitHub issue syncing (handled in separate integration modules).
- Voice channel transcription.

---

## Further Notes

- The Web Dashboard is hosted on `http://localhost:3000` and the Backend API runs on `http://localhost:3001`.
- All automated tests must pass with `npm run build && npm test`.
