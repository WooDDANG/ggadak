# Bot Context

A Discord daemon monitoring channel conversations, harvesting discussion windows, extracting Decision Candidates with AI, and dispatching payload events.

## Language

**Discussion Context**:
The bounded, structured window of Discord messages (preserving author, timestamp, and reply relationships) harvested for AI decision extraction.
_Avoid_: Chat Log, History, Transcript, Raw Messages

**Harvesting Window**:
The configurable asymmetric message boundary (before N, after N) or complete thread history collected around a trigger.
_Avoid_: Message Buffer, Context Chunk, Batch

**Channel Checkpoint**:
The snowflake ID marker stored per channel representing the latest analyzed message for incremental synchronization.
_Avoid_: Watermark, Last Position, Cursor, Offset

**Decision Conflict**:
An interactive Discord prompt triggered when an extracted Decision Candidate appears to contradict or pivot an active Decision Record.
_Avoid_: Collision, Override, Overwrite, Duplicate

**Egress Queue**:
The persistent local SQLite queue ensuring at-least-once delivery of Decision Payloads to the backend server.
_Avoid_: Outbox, Message Queue, Task Buffer
