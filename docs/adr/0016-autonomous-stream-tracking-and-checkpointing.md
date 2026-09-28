# ADR 0016: Autonomous Stream Tracking, Checkpointing, and Reaction Feedback

## Status
Accepted

## Context
Previously, the bot only triggered decision analysis upon a manual 📌 pin emoji reaction. To make decision tracking truly autonomous, continuous, and user-friendly, the system required:
1. Continuous passive monitoring of messages with composite trigger conditions (consensus keywords and reaction count thresholds).
2. Channel analysis checkpoint (watermark) persistence to avoid duplicate LLM invocations and enable incremental scanning.
3. Visual lifecycle emoji reactions (👀 during processing, 📝 on record, cleanup on casual talk).
4. Safe debouncing and in-flight locking to prevent duplicate concurrent LLM executions during rapid message bursts.
5. Preserving manual 📌 reactions as an immediate override.

## Decision
1. **Trigger Condition**:
   - Linguistic consensus patterns (`/(~?합시다|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?진행할게요|~?완료|픽스)/i`).
   - Reaction count threshold: Total reaction count on a message >= 3.
2. **Debounce & In-Flight Lock**:
   - 15-second debounce window per channel to bundle finishing discussion thoughts.
   - Channel-level in-flight lock to prevent parallel overlapping extraction requests.
3. **Analysis Checkpoints**:
   - Backend SQLite table `channel_checkpoints (channel_id TEXT PRIMARY KEY, last_message_id TEXT NOT NULL, updated_at TEXT NOT NULL)`.
   - Lazy backfill: Initializes watermark on the first message event in a channel by scanning up to 50 previous messages.
4. **Reaction Feedback**:
   - Bot adds `👀` reaction to the trigger message when analysis commences.
   - If decision(s) are recorded, updates/adds `📝` reaction and sends decision confirmation embed.
   - If evaluated as casual chat with no decisions, removes the `👀` reaction to avoid noise.
5. **Manual 📌 Override**:
   - Manual 📌 emoji reaction immediately bypasses debounce and executes analysis for the surrounding window.

## Consequences
- **Positive**: Zero manual effort required for recording obvious consensus; transparent visual feedback to team members; resilient cross-restart incremental watermarking.
- **Trade-off**: Requires message content and reaction intents in Discord; debounce adds a brief 15s window before embed output.
