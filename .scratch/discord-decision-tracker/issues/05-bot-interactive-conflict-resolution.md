# 05 — Bot Interactive Conflict Resolution

**What to build:** Implement conflict detection for decisions in `apps/bot`, surfacing Discord Embeds with action buttons (`Supersede` vs `Independent`) when an extracted decision collides with an existing active decision.

**Blocked by:** 04 — Bot LLM Extraction Engine

**Status:** resolved

- [x] Implement semantic/topic conflict checker against recent decisions
- [x] Build Discord embed and action row with "Supersede Existing" and "Create Independent" buttons
- [x] Handle button interaction events and transition decision states accordingly
- [x] Add tests for conflict detection and interaction state changes
