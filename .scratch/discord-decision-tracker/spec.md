# Spec: Discord Decision Tracker (Thin Bot Adapter & Backend AI Core)

Status: `ready-for-agent`

## Problem Statement

When organizational discussions take place in Discord, decisions and consensus are easily lost in high-velocity chat history. Furthermore, embedding heavy AI pipelines, prompt logic, and multi-tenant management inside a platform-specific bot makes the bot brittle, hard to test, and impossible to reuse across other communication surfaces (e.g. Slack, web meeting transcripts, Notion).

## Solution

A refined 3-tier monorepo architecture where:
1. **`@ggaddak/bot`** serves as a lightweight Discord Gateway Adapter that senses 📌 reactions and commands, harvests raw message context windows with reply metadata, and presents interactive confirmation embeds.
2. **`@ggaddak/be`** acts as the intelligent core exposing `POST /api/discussions/analyze` to execute LLM decision extraction, detect decision conflicts, persist decision timelines in SQLite, and serve REST endpoints to consumers.
3. **`@ggaddak/fe`** provides an interactive decision dashboard with expandable in-place Discord conversation transcripts, search filters, and status timelines.
4. **`@ggaddak/shared`** unifies domain types, Zod schemas, and structured Winston/Morgan logging.

## User Stories

1. As a team member, I want the bot to automatically detect consensus statements (e.g., `~합시다`, `~결정`, `~확정`) or messages with multiple reactions, without needing to manually pin every time.
2. As a team member, I want to see an immediate `👀` reaction when the bot starts analyzing a discussion, and a `📝` reaction when an agreed decision is saved.
3. As a team member, I want the bot to clean up the `👀` reaction silently if the conversation was only casual chat.
4. As a team member, I want to manually react with 📌 to immediately force decision analysis, bypassing automatic debouncing.
5. As an operator, I want the bot to persist channel analysis checkpoints so that reboots do not duplicate previous analysis or skip unprocessed messages.
6. As a developer, I want the LLM extraction engine to live inside the backend API server, so that I can switch or tune AI models (Gemini, Claude, OpenAI) in one place without restarting the Discord bot.
7. As a developer, I want the backend `POST /api/discussions/analyze` endpoint to accept raw conversation messages from any source (Discord, Slack, manual web paste), so that our organization uses a single decision extraction pipeline.
8. As a team member in Discord, I want the bot to detect when a new decision conflicts with an existing active decision and present "Supersede" vs "Keep Independent" buttons in the channel.
9. As a team member, I want to see a confirmation embed in Discord summarizing the extracted Topic, Decision, Rationale, and Action Items.
10. As a web user, I want to view a chronological timeline of all organizational decisions on the web dashboard.
11. As a web user, I want to click an expandable accordion on any decision card to read the complete authentic Discord chat transcript with author names, timestamps, and reply tags.
12. As an engineer, I want all HTTP requests and bot lifecycle events logged with structured Winston/Morgan timestamps and saved to `logs/combined.log` and `logs/error.log`.
13. As a developer, I want all contracts shared via `@ggaddak/shared` so schema drift between bot, backend, and frontend is eliminated.

## Implementation Decisions

### 1. Ingestion Adapter (`apps/bot`)
- **Trigger Detector**: Evaluates incoming `messageCreate` and `messageReactionAdd` events against consensus keyword regex (`~합시다`, `~결정`, `~확정`, `~합의`, `~채택`, `~가시죠`, `~진행할게요` 등) and reaction count threshold (>= 3).
- **Debounce & In-Flight Lock Queue**: Buffers trigger events for 15s per channel and manages an in-flight lock to prevent duplicate parallel extraction requests.
- **Reaction Feedback**: Adds `👀` to trigger messages during extraction and replaces with `📝` on successful Decision creation or removes `👀` on casual chatter.
- **Manual 📌 Override**: Immediate priority execution on 📌 reaction without debouncing.
- **Message Harvester & Checkpoint Sync**: Harvests incremental message windows since the last checkpoint, and syncs updated checkpoint back to Backend.

### 2. Backend Intelligence Core (`apps/be`)
- **Extraction API (`POST /api/discussions/analyze`)**:
  - Builds structured transcript from raw messages.
  - Calls Vercel AI SDK (`ai` + `zod`) with `generateObject` to extract `Topic`, `Decision`, `Rationale`, and `ActionItems`.
  - Queries local database for topic overlap to determine `hasConflict` and `conflictingDecision`.
  - Persists the new `Decision` along with `rawTranscript` and `source.rawMessages` into SQLite.
  - Returns `{ status: 'ok', decision, hasConflict, conflictingDecision }` to the caller.
- **Conflict Resolution API (`POST /api/decisions/resolve-conflict`)**:
  - Updates `supersedesId` and marks the previous decision state as `Superseded` when requested.
- **Query API (`GET /api/decisions`)**:
  - Returns decisions sorted by timestamp with optional `topic` and `state` filters.
- **HTTP Logger**: Streams Morgan request logs to Winston's `http` transport.

### 3. Frontend Dashboard (`apps/fe`)
- **Decision Timeline**: Renders decision cards sorted chronologically.
- **Expandable Chat Transcript Accordion**: `<details class="transcript-accordion">` displays styled Discord chat bubbles with author, reply link, and timestamp.
- **Live Search & Filter**: Instant filtering across topic, decision, rationale, and raw transcript text.

### 4. Shared Domain Package (`packages/shared`)
- Exports Zod schemas (`DecisionSchema`, `RawMessageEntrySchema`, `ActionItemSchema`, `DecisionStateSchema`).
- Exports `createLogger(serviceName)` Winston factory with console colorization and daily file transport.

## Testing Decisions

### What Makes a Good Test
- Tests should exercise the system through external API and event boundaries.
- The Discord bot should be verifiable with mock Discord client events and a mock backend server.
- The Backend analysis endpoint must be verified against simulated conversation transcripts with predictable mock LLM responses.

### Primary Seam (E2E Integration)
- End-to-end integration harness in `test/e2e.test.ts`:
  1. Feed simulated raw Discord messages to `POST /api/discussions/analyze`.
  2. Verify LLM extraction, conflict detection, and SQLite persistence with embedded transcript.
  3. Query `GET /api/decisions` and verify all fields (including `rawTranscript` and `rawMessages`) are returned accurately for web rendering.

## Out of Scope

- Direct voice channel real-time speech transcription.
- Multi-tenant cloud SaaS billing integration.
- Bidirectional web-to-discord push notifications in the initial MVP phase.

## Further Notes

- Monorepo configured with npm/pnpm workspaces.
- All code follows [CONTEXT-MAP.md](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT-MAP.md) and ADRs 0001 through 0013.
