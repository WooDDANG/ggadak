# 02 — Bot Semantic Decision Evaluator & Silent Trigger

**What to build:** Integration of the semantic decision evaluator into `DiscussionHarvester` and message handlers in `apps/bot`. When messages arrive in Discord, the bot computes semantic similarity locally, combines it with participant and emoji reactions, and triggers silent context harvesting (`👀` ➔ `📝`) without spamming channel messages.

**Blocked by:** 01 — Semantic Embedding Engine & Anchor Matching

**Status:** resolved

- [x] Connect `evaluateSemanticDecision` into `MessageHandler` and `DiscussionHarvester`.
- [x] Trigger harvesting when semantic similarity >= threshold (default 0.28) OR reaction threshold is reached.
- [x] Pass `score`, `participantCount`, `reactionsCount` and full surrounding context (before 15, trigger, after 5) to Backend API.
- [x] Preserve silent mode: purely use `👀` (analyzing) ➔ `📝` (drafted) emoji reactions.
- [x] Unit tests in `apps/bot/src/bot.test.ts`.
