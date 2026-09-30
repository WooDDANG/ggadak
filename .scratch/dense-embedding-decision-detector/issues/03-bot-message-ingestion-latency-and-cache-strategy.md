# 03 — Bot Message Ingestion Latency & Embedding Caching

Type: task
Status: open
Blocked by: 01, 02

## Question

How should embedding vector calculation be integrated into Discord's `messageCreate` event loop to avoid blocking?
- Should we use an LRU vector cache for frequent phrases?
- Should embedding comparison run async with debounce before triggering backend analysis?
