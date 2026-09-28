# Bot Context

A Discord daemon monitoring channel conversations, extracting structured Decisions and Rationales with LLM, and dispatching webhook payloads.

## Language

**Discussion Context**:
The bounded, structured window of Discord messages (preserving author, timestamp, and reply relationships) sent to the LLM to extract a Decision and its Rationale.
_Avoid_: Chat Log, History, Transcript, Raw Messages

**Decision Conflict**:
A situation where a newly captured Decision modifies, contradicts, or replaces an existing Decision, triggering an interactive confirmation in Discord.
_Avoid_: Collision, Override, Overwrite, Duplicate

**Egress Queue**:
The persistent local SQLite queue ensuring at-least-once delivery of Decision Payloads to the Web Consumer despite network outages.
_Avoid_: Outbox, Message Queue, Task Buffer
