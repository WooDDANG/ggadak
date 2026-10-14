# 03 — Bot Message Ingestion Latency & Embedding Caching

Type: task
Status: needs-triage
Blocked by: 01, 02

## Question

How should embedding vector calculation be integrated into Discord's `messageCreate` event loop to avoid blocking?
- Should we use an LRU vector cache for frequent phrases?
- Should embedding comparison run async with debounce before triggering backend analysis?

## Comments

2026-10-14: Debounce/채널 직렬화는 구현돼 있다. 동기 scorer 지연 측정 후 캐시·비동기화 필요성을 결정한다. 02의 평가 결과에 의존한다.
