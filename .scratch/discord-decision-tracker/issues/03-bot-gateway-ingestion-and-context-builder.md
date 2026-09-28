# 03 — Bot Gateway Ingestion and Context Builder

**What to build:** Implement Discord Gateway client in `apps/bot` that listens for 📌 emoji reactions and `/decision scan` commands, fetches 20–30 preceding messages, and builds a structured `Discussion Context` preserving reply links and timestamps.

**Blocked by:** 01 — Shared Domain Schemas

**Status:** resolved

- [x] Setup `discord.js` Client with necessary Gateway Intents
- [x] Implement `messageReactionAdd` listener for configured emoji (📌)
- [x] Implement `/decision scan` slash command
- [x] Build `DiscussionContextBuilder` to construct transcript with timestamps and reply metadata
- [x] Add unit tests for transcript formatter
