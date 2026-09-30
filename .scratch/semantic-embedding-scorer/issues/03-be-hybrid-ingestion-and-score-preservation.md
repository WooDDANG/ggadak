# 03 — Backend Hybrid Ingestion & Governance Score Preservation

**What to build:** Backend `DiscussionService` receives the semantic-filtered payload and Discord score, slices sessions, extracts structured fields (title, topic, rationale, alternatives, action items, category) via Gemini 2.5 Flash / dynamic heuristic fallback, and saves DRAFT candidate cards with accurate governance scores into the Review Queue.

**Blocked by:** 01 — Semantic Embedding Engine & Anchor Matching, 02 — Bot Semantic Decision Evaluator & Silent Trigger

**Status:** resolved

- [x] Ingest `score`, `participantCount`, `reactionsCount` from `AnalyzeDiscussionRequestDto`.
- [x] Slice messages into 30-minute idle gap sessions.
- [x] Invoke AI/heuristic fallback to extract rich structured fields.
- [x] Preserve the Discord-calculated consensus score as `governanceScore` on the saved decision candidate.
- [x] Unit & service tests in `apps/be`.
