# 04 — E2E Verification & Review Queue Pipeline

**What to build:** End-to-end integration test verifying the complete hybrid pipeline from Discord message semantic evaluation to Backend AI extraction, Governance scoring, and Review Queue confirmation on the Web UI.

**Blocked by:** 01 — Semantic Embedding Engine & Anchor Matching, 02 — Bot Semantic Decision Evaluator & Silent Trigger, 03 — Backend Hybrid Ingestion & Governance Score Preservation

**Status:** resolved

- [x] Simulate Discord messages containing natural semantic agreement phrases without exact regex keywords.
- [x] Verify bot evaluates semantic similarity, calculates consensus score, and sends context silently.
- [x] Verify backend generates DRAFT decision candidate with governance score and structured fields.
- [x] Verify Review Queue confirmation lifecycle.
