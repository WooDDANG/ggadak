# Discord Decision Tracker

A decoupled TypeScript daemon that monitors Discord server conversations, extracts structured Decisions and their underlying Rationales using an LLM, and transmits them to external Web services via HTTP REST/Webhooks.

## Language

**Decision**:
A finalized conclusion reached by the team along with the rationale and context behind it.
_Avoid_: Resolution, Conclusion, Agreement, Verdict

**Rationale**:
The explicit reasons, background context, and tradeoffs that led to a specific Decision.
_Avoid_: Reason, Context, Background, Justification

**Topic**:
A distinct subject or discussion thread within a Discord channel from which Decisions emerge.
_Avoid_: Subject, Agenda, Issue, Thread

**Action Item**:
A concrete follow-up task assigned to a member as a direct consequence of a Decision.
_Avoid_: Task, Todo, Job, Work Item

**Decision State**:
The lifecycle status of a Decision (`Proposed`, `Discussing`, `Decided`, `Superseded`).
_Avoid_: Status, Phase, Stage, Condition

**Discussion Context**:
The bounded, structured window of Discord messages (preserving author, timestamp, and reply relationships) sent to the LLM to extract a Decision and its Rationale.
_Avoid_: Chat Log, History, Transcript, Raw Messages

**Embedded Transcript**:
The full raw discussion transcript and message entries attached directly to a Decision entity, allowing users to inspect the authentic conversation directly within the Web interface.
_Avoid_: Chat History, Raw Dump, Log Attachment

**Decision Conflict**:
A situation where a newly captured Decision modifies, contradicts, or replaces an existing Decision, triggering an interactive confirmation in Discord.
_Avoid_: Collision, Override, Overwrite, Duplicate

**Web Consumer**:
The external web API or endpoint that receives structured Decision payloads via HTTP push for visual tracking and management.
_Avoid_: Dashboard, Frontend, Portal, Viewer

**Decision Payload**:
The standardized JSON contract sent to the Web Consumer containing the Decision, Rationale, Action Items, Embedded Transcript, source references, and metadata.
_Avoid_: Webhook Body, Message Data, Export Object

**Egress Queue**:
The persistent local SQLite queue ensuring at-least-once delivery of Decision Payloads to the Web Consumer despite network outages.
_Avoid_: Outbox, Message Queue, Task Buffer

**Service Logger**:
The standardized, structured Winston logger instance providing formatted console output and rotating file storage across all monorepo services.
_Avoid_: Console Log, Print Statement, System Out

**Extraction Engine**:
The backend AI intelligence pipeline in `apps/be` parsing raw discussion transcripts into structured multi-decision records using Vercel AI SDK with Korean few-shot examples and strict consensus verification.
_Avoid_: AI Bot, Parser Script, Text Analyzer
