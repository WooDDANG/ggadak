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
The message boundary marking the end of a continuously completed channel scan range. An isolated event analysis does not establish that earlier messages have been processed.
_Avoid_: Watermark, Last Position, Cursor, Offset

**Decision Conflict**:
An apparent contradiction or replacement relationship between a Decision Candidate and a confirmed Decision Record, requiring human review in the Web Review Queue.
_Avoid_: Collision, Override, Overwrite, Duplicate

**Egress Queue**:
The durable collection of pending Discussion Context analysis requests retained until analysis completes, including requests awaiting retry after a failure.
_Avoid_: Outbox, Message Queue, Task Buffer

**Analysis Request**:
A request to evaluate one harvested Discussion Context, distinct from any Decision Candidates it may produce. Retrying delivery preserves the request's identity; intentional reanalysis is a new request.
_Avoid_: Extraction Task, Analysis Event

**Scan Range**:
A bounded section of a channel's message history evaluated as part of a scan. Completing a later range does not imply completion of earlier ranges.
_Avoid_: Scan Page, Message Batch
