# 01 — Semantic Embedding Engine & Anchor Matching

**What to build:** A lightweight semantic text embedding and cosine similarity evaluation module in `@ggaddak/shared` that compares arbitrary discussion text against curated decision anchor vectors (architecture, tech stack, feature priority, scheduling) and returns a semantic decision confidence score.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Provide lightweight TF-IDF / N-gram cosine embedding vectorizer for zero-external-dependency semantic scoring.
- [x] Curate Korean & English decision anchor sets (e.g., "우리는 A 기술을 도입하기로 결정했습니다", "해당 아키텍처로 진행합시다", "We decided to adopt X framework").
- [x] Implement `evaluateSemanticDecision(text: string): { similarity: number; isCandidate: boolean; matchedAnchor?: string }`.
- [x] Unit tests verifying semantic similarity scores for diverse decision phrases and non-decision casual talk.
