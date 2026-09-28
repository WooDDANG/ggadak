# Spec: Discord Decision Tracker

Status: `ready-for-agent`

## Problem Statement

When teams collaborate on Discord, valuable architectural, product, and operational decisions are made dynamically across channels and discussion threads. Because chat conversations move quickly and are filled with casual noise, critical decisions, their rationales, and the action items agreed upon get buried in chat history. As a result, team members lose track of why decisions were made, newcomers lack context, and external web dashboards or management systems have no visibility into the team's consensus.

## Solution

A decoupled TypeScript daemon that monitors Discord server conversations and extracts structured `Decision` objects along with their underlying `Rationale`, `Action Items`, and `Topic` context using an LLM. It captures conversations through a hybrid ingestion model (explicit emoji reactions/commands and scheduled batch runs), provides interactive in-Discord resolution for `Decision Conflicts`, and transmits standardized `Decision Payloads` to external `Web Consumer` endpoints via HTTP REST/Webhooks.

## User Stories

1. As a team member, I want to react to a Discord message with a specific emoji (e.g. 📌), so that the bot captures the surrounding discussion context and extracts any decisions made.
2. As a team lead, I want to use a slash command (e.g. `/extract-decisions`), so that I can explicitly trigger decision extraction on a specific thread or channel.
3. As a team member, I want the bot to understand the full rationale behind a decision, so that future reviewers know why a particular choice was made over alternatives.
4. As a project manager, I want action items with assigned members and deadlines to be identified alongside decisions, so that follow-up responsibilities are clear.
5. As a developer, I want the bot to detect when a newly extracted decision contradicts an existing decision, so that superseded decisions are explicitly flagged rather than silently ignored.
6. As a team member in Discord, I want to see an interactive confirmation message when a decision conflict occurs, so that I can choose whether to supersede the previous decision or record it as a separate decision.
7. As a community manager, I want periodic scheduled batch scans of active channels, so that decisions made without explicit emoji triggers are still captured.
8. As a web developer, I want to receive standardized JSON `Decision Payloads` at a configured HTTP Webhook endpoint, so that my web application can render live decision dashboards and timelines.
9. As a web consumer, I want each decision payload to include Discord source metadata (guild ID, channel ID, message URL, participants), so that users on the web can navigate back to the original Discord discussion.
10. As an administrator, I want to configure the webhook endpoint URL and secret header token, so that the decision data transmission is secure.
11. As a team member, I want the bot to ignore casual chatter and off-topic messages during extraction, so that the decision record remains concise and noise-free.
12. As a team member, I want to query recent decisions directly in Discord using a search command, so that I don't have to leave Discord to check past agreements.

## Implementation Decisions

### 1. Ingestion Subsystem
- **Emoji Reaction Handler**: Listens for specific reaction events (configurable, defaulting to 📌/🎯). Retrieves the containing `Thread` or fetches a buffer of 20–30 preceding messages to construct the `Discussion Context`.
- **Slash Command Handler**: Provides `/decision record` and `/decision scan` commands to trigger on-demand analysis for specific channels or threads.
- **Batch Scheduler**: Uses a configurable cron/interval runner to scan designated public channels for unanalyzed message windows.

### 2. Decision Extraction & LLM Engine
- **Prompt Architecture**: Structures LLM input with system instructions defining `Decision`, `Rationale`, `Topic`, and `Action Item`. Requires structured JSON output schema.
- **Conflict Detector**: Queries the recent decision store/index with the newly extracted topic. If semantic overlap or contradiction is identified, flags the extraction as a `Decision Conflict`.

### 3. Interactive Discord UI Component
- **Confirmation Embed & Action Rows**: When a `Decision Conflict` is detected, the bot sends an embed outlining the new decision vs. the existing decision, with "Supersede Existing" and "Create Independent" button interactions.
- **Preview & Acknowledgment**: When an extraction succeeds without conflict, posts an ephemeral or transient confirmation embed in the channel.

### 4. Webhook & Egress Pipeline
- **HTTP Client**: Transmits POST requests with retry and backoff mechanisms to the configured `Web Consumer` endpoint.
- **Payload Schema**:
  - `id`: Unique decision identifier (UUID)
  - `topic`: Discussion topic title and description
  - `decision`: Concrete agreed conclusion
  - `rationale`: Context, reasons, trade-offs, and discarded options
  - `action_items`: Array of items with description, assignee (Discord user handle/ID), and optional due date
  - `state`: Lifecycle state (`Proposed`, `Discussing`, `Decided`, `Superseded`)
  - `supersedes_id`: Optional reference to previous decision ID
  - `source`: Guild ID, channel ID, thread ID, trigger message ID, message URL, author IDs
  - `created_at`: ISO timestamp

### 5. Local State & Cache
- An embedded SQLite cache stores recent decision hashes and IDs to enable fast local conflict detection and prevent duplicate processing during batch scans.

## Testing Decisions

### What Makes a Good Test
- Tests should exercise complete functional units through external interfaces (Discord event in ➔ LLM parsing ➔ Webhook POST out), without asserting on private helper methods.
- Timeouts, rate-limiting, and network failures in Discord and Webhook endpoints must be simulated to verify resilience.

### Seams and Test Plan
- **Primary Seam (Highest Level Integration)**: An end-to-end event harness that feeds simulated Discord Gateway events (`messageReactionAdd`, `interactionCreate`), supplies a deterministic Mock LLM response, and intercepts outgoing HTTP requests to assert the structure of the `Decision Payload`.
- **LLM Parser Unit Tests**: Given fixture Discord conversation transcripts, verify that the extractor accurately outputs structured `Decision`, `Rationale`, and `Action Items`.
- **Webhook Egress Retry Tests**: Verify that HTTP 5xx responses trigger exponential backoff and eventual dead-letter logging without crashing the daemon.

## Out of Scope

- Hosting a custom Web UI dashboard inside this repository (handled by external Web Consumers).
- Bidirectional synchronization (Web to Discord webhook updates) in the MVP phase.
- Multi-tenant cloud hosting architecture with billing/SaaS management.
- Voice channel audio transcription or sentiment analysis.

## Further Notes

- The daemon will rely on standard environment variables for configuration (`DISCORD_BOT_TOKEN`, `LLM_API_KEY`, `WEB_CONSUMER_URL`, `WEB_CONSUMER_SECRET`).
- Designed in accordance with [CONTEXT.md](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT.md) and ADRs 0001 through 0005.
