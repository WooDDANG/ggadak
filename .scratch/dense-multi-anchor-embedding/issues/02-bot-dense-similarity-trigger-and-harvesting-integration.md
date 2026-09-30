# 02 — Bot Dense Similarity Trigger & Real-Time Context Harvesting

**What to build:** Integrate the dense multi-anchor evaluator into `MessageHandler` and `DiscussionHarvester` in `apps/bot`. When messages arrive in Discord, compute dense similarity across all 20 anchors. If `max(similarity) >= 0.70`, trigger silent context harvesting (`👀` ➔ `📝`) and send context + Discord score to Backend API.

**Blocked by:** 01 — Multi-Anchor Dense Embedding Corpus & Evaluator

**Status:** resolved

- [x] Connect `evaluateDenseMultiAnchorSimilarity` into `apps/bot` message handler.
- [x] Trigger context harvesting when `maxSimilarity >= 0.70` OR reaction threshold is met.
- [x] Maintain complete silent mode: no public channel embed messages, purely `👀` ➔ `📝` emoji status.
- [x] Unit tests in `apps/bot/src/bot.test.ts`.
