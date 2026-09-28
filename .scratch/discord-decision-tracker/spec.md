# Spec: Autonomous Stream Tracking, Checkpointing & Decision Ingestion Pipeline

Status: `ready-for-agent`

## Problem Statement

In fast-paced Discord team channels, critical architectural decisions, consensus agreements, and action items are buried inside casual conversation and lost over time. Relying on users to remember to manually add pin reactions to every agreed decision leads to incomplete decision logs. Furthermore, when bots process streams naively without tracking their last analyzed watermark, restarting the daemon causes duplicate analysis, rate-limit thrashing, or skipped message windows. Team members also lack real-time visibility into whether the bot is actively evaluating a discussion context, leading to confusion about what has been captured.

## Solution

An end-to-end, decoupled decision ingestion and tracking system featuring:
1. **Autonomous Stream Monitoring**: Passively scans conversation streams in real time, detecting consensus keywords (e.g., `~합시다`, `~결정`, `~확정`) and message reaction spikes (>= 3 reactions) without requiring manual pins.
2. **Analysis Checkpointing (Watermarking)**: Persists the latest analyzed message watermark per channel in SQLite, enabling restart-resilient, incremental context window harvesting.
3. **Transparent Reaction Feedback**: Adds an `👀` reaction to trigger messages during active evaluation, upgrades to `📝` and posts a structured Discord embed upon Decision creation, and silently removes `👀` if the discussion is determined to be casual chatter.
4. **Immediate Manual Override**: Retains manual `📌` reactions to immediately trigger analysis without debounce delay.
5. **Centralized Multi-Decision AI Intelligence**: Delegates raw message transcripts to a backend extraction engine that extracts decisions, rationales, and action items using structured LLM schemas with deterministic fallback.
6. **Conflict Resolution & Web Timeline**: Detects conflicting active decisions, offers interactive Discord button prompts (Supersede vs Independent), and renders authentic discussion transcripts inside an expandable web dashboard.

## User Stories

1. As a team member, I want the bot to automatically detect linguistic consensus expressions (e.g., `~합시다`, `~결정`, `~확정`, `~가시죠`) in chat messages, so that team agreements are tracked without manual intervention.
2. As a team member, I want the bot to trigger analysis when a message accumulates multiple reactions (>= 3), so that highly endorsed proposals are evaluated for decisions.
3. As a team member, I want to see an immediate `👀` emoji reaction on the trigger message when the bot begins analysis, so that I know the bot is reading the context.
4. As a team member, I want the `👀` reaction replaced with `📝` and a summary embed posted when a decision is recorded, so that the team has visible confirmation of the agreement.
5. As a team member, I want the `👀` reaction to be silently removed if the conversation was casual talk, so that channel history remains uncluttered.
6. As a team member, I want to manually react with `📌` on any message to immediately force decision analysis, bypassing automatic debouncing.
7. As an operator, I want each channel's last analyzed message ID (Analysis Checkpoint) persisted in SQLite, so that restarting the bot resumes from where it left off without duplicating analysis.
8. As a developer, I want the bot to buffer rapid bursts of messages with a 15-second debounce window, so that related finishing thoughts are analyzed together in a single request.
9. As a developer, I want channel-level in-flight locks during backend requests, so that concurrent triggers do not spawn overlapping duplicate AI analyses.
10. As an engineer, I want the AI extraction engine hosted in the backend service, so that prompt logic and model providers (Gemini, OpenAI, Mock) can be tuned independently of the Discord gateway client.
11. As a developer, I want multiple distinct decisions agreed upon in a single conversation block extracted into separate, independent Decision entities.
12. As a team lead, I want action items to capture specific assignees, so that task accountability is clear.
13. As a team member, I want the bot to detect when a new decision conflicts with an existing active decision and present "Supersede" and "Keep Independent" buttons in Discord.
14. As a user clicking a conflict resolution button, I want the bot to acknowledge the button interaction immediately (under 3 seconds) and update the message, so that Discord gateway timeout errors are eliminated.
15. As a web user, I want a chronological timeline of all recorded decisions accessible on the web interface.
16. As a web user, I want an expandable transcript accordion on each decision card displaying the authentic raw conversation with participant handles and timestamps.
17. As a web user, I want to search and filter decisions by topic, state (`Decided`, `Superseded`), and keywords.
18. As a site reliability engineer, I want all HTTP and daemon lifecycle events recorded with structured Winston/Morgan logging in rotating log files.
19. As a monorepo developer, I want shared domain schemas and types exported from a common package to guarantee contract consistency across all tiers.

## Implementation Decisions

### 1. Bot Ingestion & Stream Adapter (`apps/bot`)
- **Trigger Detector**: Subscribes to `messageCreate` and `messageReactionAdd` events. Evaluates text against consensus regex `/(~?합시다|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?진행할게요|~?완료|픽스|fix|agree)/i` and checks total reaction count against `REACTION_THRESHOLD = 3`.
- **Debounce & In-Flight Lock Queue**: Buffers triggered channels with a 15-second timer (`DEBOUNCE_MS = 15000`). Maintains an `inFlightChannels` set to drop duplicate triggers while a channel's analysis is in progress.
- **Reaction Feedback Lifecycle**: Appends `👀` to the trigger message at start; replaces with `📝` on successful decision extraction; removes `👀` on casual chatter or backend failure.
- **Manual 📌 Override**: Direct 📌 reaction cancels any pending debounce timer and executes analysis immediately.
- **Incremental Context Window Harvester**: Queries the backend for the channel's `Analysis Checkpoint` (`lastMessageId`) and fetches up to 50 messages since that watermark, falling back to a 30-message preceding window on initial channel scan.
- **Interaction Dispatcher**: Global non-blocking listener for `interactionCreate` that executes `interaction.deferUpdate()` immediately and relays conflict resolutions to the backend.

### 2. Backend Intelligence Core (`apps/be`)
- **Analysis Checkpoint Storage**: SQLite table `channel_checkpoints (channel_id TEXT PRIMARY KEY, last_message_id TEXT NOT NULL, updated_at TEXT NOT NULL)` with REST endpoints `GET /api/channels/:channelId/checkpoint` and `POST /api/channels/:channelId/checkpoint`.
- **Discussion Analysis API (`POST /api/discussions/analyze`)**:
  - Builds formatted transcripts preserving author, timestamp, and reply hierarchies.
  - Automatically advances and saves the channel's checkpoint to the newest message ID.
  - Executes AI extraction with structured JSON schemas, falling back gracefully to deterministic parsing on API errors.
  - Checks for topic collisions against active `Decided` records to flag `hasConflict` and `conflictingDecision`.
  - Persists new `Decision` entities with `rawTranscript` and source metadata into SQLite.
- **Conflict Resolution API (`POST /api/decisions/resolve-conflict`)**:
  - Updates `supersedesId` and transitions the prior decision's state to `Superseded`.
- **Decision Query API (`GET /api/decisions`)**:
  - Returns decisions with optional `topic` and `state` query parameters.

### 3. Web Dashboard Consumer (`apps/fe`)
- **Interactive Timeline**: Renders decision cards chronologically with color-coded status badges (`Decided`, `Superseded`).
- **Expandable Chat Transcript Accordion**: `<details>` component rendering stylized chat messages with author handles, ISO timestamps, and reply indicators.
- **Client-side Search & State Filter**: Instant live filtering across topics, decisions, rationales, and raw transcript text.

### 4. Shared Domain Model (`packages/shared`)
- Exports Zod schemas and TypeScript types: `DecisionSchema`, `ChannelCheckpointSchema`, `DecisionPayloadSchema`, `ActionItemSchema`, `DecisionStateSchema`, `DiscordSourceSchema`.
- Exports `createLogger(serviceName)` providing Winston console colorization and file transports (`logs/combined.log`, `logs/error.log`).

## Testing Decisions

### What Makes a Good Test
- Tests must verify observable system behavior across external API boundaries (HTTP REST, Discord event handlers, and SQLite query outputs) rather than internal private variables.
- AI extraction must be verified with deterministic test inputs to guarantee reproducible results without external API flakiness.
- All tests must run autonomously in automated CI/CD pipelines via standard Node.js test runners.

### Test Coverage & Seams
1. **Shared Schemas (`packages/shared`)**: Validates schema parsing and rejection of malformed states and payloads.
2. **BE Server & Checkpoint APIs (`apps/be`)**: Tests ingestion, decision query, conflict resolution, and channel checkpoint CRUD operations against an in-memory SQLite database.
3. **Bot Core Modules (`apps/bot`)**: Tests transcript construction with reply hierarchies, conflict detection, egress queue dispatching, and consensus keyword regex accuracy.
4. **Primary Seam (E2E Integration `test/e2e.test.ts`)**: Simulates the full workflow from raw message ingestion to backend AI analysis, checkpoint advancement, conflict resolution, and database persistence.

## Out of Scope

- Real-time voice channel audio transcription and speaker diarization.
- Multi-tenant cloud SaaS billing and organization workspaces.
- Bidirectional Discord modal forms for manual decision editing from the web.

## Further Notes

- Built as a TypeScript monorepo with npm/pnpm workspaces.
- Fully documented in [CONTEXT.md](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT.md), [CONTEXT-MAP.md](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT-MAP.md), and ADRs 0001 through 0016.
