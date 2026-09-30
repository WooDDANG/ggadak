# Spec: Decision Candidate Extraction Policy, Review Queue & Centralized Config

Status: `ready-for-agent`

## Problem Statement

When engineering and product teams collaborate in Discord, critical decisions on project scope, architecture, product targets, and features are easily lost in high-velocity chat streams. However, allowing an AI bot to autonomously mark conclusions as confirmed decisions without human review introduces significant risks of false positives, incomplete rationale, and team miscommunication. 

Furthermore, tuning harvesting thresholds (such as lookback window sizes, debounce durations, and reaction triggers) requires editing scattered code constants rather than managing them centrally. When users reject or delete an inaccurate candidate, naive re-scans can repeatedly re-generate the same discarded decision card. Lastly, teams lack structured tracking for rejected alternatives, pivot relationships against existing decisions, and external mentor/professor feedback.

## Solution

A human-in-the-loop decision capture and governance pipeline:
1. **Centralized Policy Configuration**: A single source of truth for all harvesting thresholds (initial scan limits, asymmetric context windows, debounce timeouts, reaction thresholds, and agreement counts) managed centrally and exposed via runtime configuration APIs.
2. **Draft Candidates & Review Queue**: All AI-extracted decisions are initially saved in a `draft` status and routed to a dedicated web review queue where team members inspect, edit, confirm, defer, or reject them.
3. **Thread-First & Asymmetric Window Ingestion**: The Discord bot prioritizes native Discord Threads as primary discussion units and captures asymmetric context windows (15 messages preceding a trigger, 5 messages following) while merging overlapping discussion intervals into a unified context block (up to 40 messages).
4. **Rich Decision Metadata**: Captures discarded alternatives and rationale (`alternatives[]`), functional domain tags (`category_tag`), pivot detection (`is_pivot`), and authentic Discord evidence links (`raw_evidence[]`).
5. **External Feedback Integration (`/피드백입력`)**: Stores mentor, judge, and professor advice as external reference context to inform subsequent team discussion analysis without falsely recording the advice itself as a team decision.
6. **Anti-Recreation Memory**: Hashes the evidence message IDs of deleted or rejected draft candidates to prevent repetitive re-generation of discarded proposals unless new conversational evidence is introduced.

## User Stories

1. As a team member, I want the bot to automatically detect discussion signals (linguistic consensus patterns, Discord threads, and reaction thresholds) and submit candidate proposals to a review queue, so that decisions are captured without polluting active project records.
2. As a product manager, I want all AI-generated decision candidates created in a `draft` state, so that a human must review and confirm them before they become official decisions.
3. As a team reviewer, I want to approve, edit, defer, or reject decision candidates in a web review queue, so that our team maintains complete governance over project records.
4. As a reviewer confirming a decision, I want the system to record my user handle as `approved_by` and set `decision_confirmed_date` to the approval timestamp, so that ownership and timeline accuracy are preserved.
5. As an engineer, I want all harvesting parameters (window sizes, limits, debounce times, reaction thresholds) managed centrally in a shared configuration module and overridable via environment variables or backend endpoints, so that we can tune policies without code rewrites.
6. As a team member discussing an issue inside a Discord Thread, I want the bot to bundle the entire thread as the primary discussion context, so that threaded conversations are analyzed as a cohesive unit.
7. As a team member chatting in a main channel, I want the bot to harvest an asymmetric context window (15 messages before, 5 messages after) when a signal is detected, so that the preceding debate and concluding remarks are both included.
8. As a developer, I want overlapping context windows from multiple nearby trigger signals merged into a single consolidated batch (up to 40 messages), so that the AI receives non-fragmented transcripts.
9. As a team lead, I want decision cards to record discarded alternatives and their explicit reasons for rejection (`alternatives[]`), so that the team remembers why other options were not selected.
10. As a project manager, I want decision cards categorized by domain tag (`타깃`, `문제정의`, `기능`, `기술`, `BM`, `기타`), so that our decision backlog is organized.
11. As a developer, I want the backend AI to compare new candidates against active confirmed decisions to detect pivots (`is_pivot: true`), so that shifts in project direction are highlighted.
12. As a team member receiving feedback from professors or judges, I want to use `/피드백입력` to store external advice, so that it serves as reference context for future team discussions without being misclassified as a decision.
13. As a reviewer rejecting a candidate card, I want the system to remember the rejected evidence message IDs, so that the bot does not repeatedly re-create the same rejected candidate on subsequent scans.
14. As an operator, I want initial channel scans on bot startup to backfill past messages up to a configurable limit (e.g. 50 messages), so that existing channel history is evaluated.
15. As a team member, I want visual Discord emoji feedback (`👀` during active processing, `📝` upon candidate generation, or silent removal on casual chatter), so that bot actions remain transparent and non-intrusive.
16. As a team member, I want to manually react with 📌 to force an immediate discussion extraction, bypassing automatic debouncing.
17. As a web user, I want an expandable accordion on every decision card to view the authentic Discord chat transcript with author handles, timestamps, and reply tags.
18. As an SRE, I want all HTTP and daemon operations logged with structured Winston/Morgan logging in rotating log files.
19. As a monorepo developer, I want shared schemas, types, and configuration contracts shared across bot, backend, and frontend packages.

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

### 3. Stream Ingestion, Thread Prioritization & Merging (`apps/bot`)
- **Thread Prioritization**: Senses `message.thread` or `channel.isThread()`; fetches the thread discussion history directly as the primary analysis context.
- **Asymmetric Context Harvesting**: Fetches `contextWindowBefore` (15) and `contextWindowAfter` (5) messages around non-threaded trigger messages.
- **Interval Merging**: Combines overlapping harvested message sequences up to `maxMergedWindow` (40) before dispatching to the backend.
- **Reaction Feedback Lifecycle**: Places `👀` during analysis; adds `📝` upon successful candidate generation; removes `👀` on casual chatter.
- **Manual 📌 Override**: Direct 📌 reaction bypasses debounce timers and immediately initiates analysis.

### 4. AI Candidate Extraction & Pivot Detection (`apps/be`)
- **Exclusion Filters**: System prompt strictly excludes casual chatter, simple scheduling, pure questions, simple file sharing, routine status reports ("개발 완료했습니다"), code typos, and directionless brainstorming.
- **Convergence Detection**: Identifies consensus when multiple participants support a proposal with no unresolved objections.
- **Pivot & Deduplication Engine**: Compares candidates against confirmed decisions in the database to detect reversals (`is_pivot: true`) and skips generation if the `evidenceHash` matches a previously rejected proposal.

### 5. External Feedback Ingestion (`apps/bot` & `apps/be`)
- **Slash Command**: Implements `/피드백입력` with modal options (Source: 교수/심사위원/팀원/인터뷰이, Content).
- **Backend Storage**: Stores entries in `external_feedbacks` table.
- **Context Injection**: Injects recent external feedback entries into the prompt context when analyzing subsequent team discussions in the same channel.

### 6. Web Dashboard Review Queue (`apps/fe`)
- **Review Queue View**: Dedicated interface displaying `Draft` candidates awaiting verification.
- **Review Actions**: Provides one-click buttons for "Confirm (승인)", "Edit (수정)", "Defer (보류)", and "Reject (삭제)".
- **Rejection Memory**: Transmits rejected `evidenceHash` to backend to prevent unwanted candidate re-generation.

## Testing Decisions

### What Makes a Good Test
- Tests must verify observable system behavior through external API boundaries (HTTP REST, Discord events, SQLite query outputs) rather than internal private variables.
- Deterministic extraction must be verified against simulated conversation scenarios to guarantee test reproducibility without external API flakiness.
- All tests must run autonomously in automated test runners.

### Test Coverage & Seams
1. **Shared Schemas & Config (`packages/shared`)**: Tests `HarvestingPolicyConfig`, rich `DecisionSchema` validation, and state machine transitions.
2. **BE Server & Checkpoint/Feedback APIs (`apps/be`)**: Tests candidate review actions (`confirm`, `defer`, `reject`), policy endpoint, and external feedback storage against in-memory SQLite.
3. **Bot Context Builder & Merger (`apps/bot`)**: Tests thread isolation, asymmetric window slicing, interval merging, and consensus regex accuracy.
4. **Primary Seam (E2E Full Pipeline `test/e2e.test.ts`)**: End-to-end integration verifying stream signal capture -> BE AI candidate extraction (`draft`) -> human review approval -> confirmed timeline persistence and query.

## Out of Scope

- Real-time voice channel audio speech-to-text transcription.
- Multi-tenant cloud SaaS billing integration.
- Custom machine learning model fine-tuning.

## Further Notes

- Built as a TypeScript monorepo with npm/pnpm workspaces.
- Conforms to [CONTEXT.md](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT.md), [CONTEXT-MAP.md](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT-MAP.md), and ADRs 0001 through 0016.
