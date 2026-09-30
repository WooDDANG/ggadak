## Destination

Determine and implement the optimal dense text embedding model & multi-anchor cosine similarity pipeline (threshold >= 0.70) for real-time Discord decision detection without blocking the event loop or exceeding API limits.

## Notes

- Domain: Discord bot real-time message processing, Semantic Text Embeddings, Cosine Similarity, Decision Anchor Vectorization.
- Skills to consult: `/grilling`, `/domain-modeling`, `/research`, `/prototype`.
- Standing preferences: High precision on Korean/English natural agreement, zero message spam in Discord, low latency (<50ms per message).

## Decisions so far

- [01 — Embedding Engine Selection: Local ONNX vs Cloud API](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/.scratch/dense-embedding-decision-detector/issues/01-embedding-engine-selection-local-vs-cloud.md) — Dense embeddings with Multi-Anchor `max(cosine_sim) >= 0.70` provide superior semantic generalization without false positives.

## Not yet specified

- Model selection: Local ONNX embedding (`@xenova/transformers` / `Xenova/all-MiniLM-L6-v2` or `bge-m3-ko`) vs Cloud API embedding (`text-embedding-004` / `text-embedding-3-small`) vs optimized sparse vectorizer.
- Anchor corpus calibration: The optimal set of Korean/English anchor vectors that reliably score >= 0.70 on real decisions while keeping casual chatter < 0.50.
- Discord event loop performance: Ensuring on-the-fly embedding calculation does not introduce lag or memory overhead in `apps/bot`.

## Out of Scope

- Hosting a dedicated standalone Vector Database (e.g. Pinecone/Milvus/Qdrant cluster) — in-memory anchor vector array is sufficient for < 100 anchors.
- End-to-end LLM fine-tuning.
