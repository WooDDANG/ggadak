# 01 — Multi-Anchor Dense Embedding Corpus & Evaluator

**What to build:** A comprehensive dense text embedding and multi-anchor vector evaluation engine in `@ggaddak/shared` that pre-vectorizes 20 curated decision anchors across technical, architectural, functional, and priority domains, and computes `max(cosine_sim(msg, anchor_k)) >= 0.70` to determine decision candidates.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Curate 20 high-fidelity Korean & English decision anchor templates spanning architecture, database selection, feature addition/removal, and sprint prioritization.
- [x] Implement dense vector feature extraction with TF-IDF subword/morpheme weighting and L2 normalization.
- [x] Implement `evaluateDenseMultiAnchorSimilarity(text: string, threshold?: number): { maxSimilarity: number; isCandidate: boolean; matchedAnchor?: string; category?: string }`.
- [x] Ensure decision expressions score >= 0.70 while casual chatter scores < 0.40.
- [x] Unit tests in `packages/shared/src/schemas.test.ts`.
