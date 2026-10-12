# Why search

`GET /api/v1/search?guildId=...&query=...&limit=10` requires a logged-in member of the selected Discord guild. `query` has 1–1000 characters after rejecting blank input; `limit` is an integer from 1 to 50, default 10. Search covers only CONFIRMED and SUPERSEDED records, including Rationale, quotations and available original discussion. IN_REVIEW, ON_HOLD and DISCARDED records are excluded. There is no cross-guild search.

Each result contains the complete v1 Decision Card, cosine similarity (`score`, -1 to 1), Rationale excerpt and the stored Discord source URL when available. Only positive similarities are returned, ordered descending with deterministic ID ties. Similarity is a ranking signal, not a probability. The Why view opens the card and Discord evidence directly.

Production uses `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL=text-embedding-3-small` and `OPENAI_API_KEY`, independent of the extraction provider. OpenAI receives the question and up to 16,000 characters of each searchable document; requests time out after 15 seconds. Missing configuration, rejected requests or malformed vectors return HTTP 503 with an explicit retry action. There is no lexical or fabricated embedding fallback. Tests inject vectors without external AI calls.

Migration `202610120006_why_embeddings` adds DecisionEmbedding, its cascading Decision foreign key, and a SQLite mutation trigger. Every committed Decision update removes its obsolete embedding, including bot ingestion, review, replacement and card edits. New and invalidated decisions are re-embedded before their next search result; the index is refreshed on demand rather than delaying successful human edits for external AI availability. The stored content digest and model also detect content/provider changes. Querying live guild/state and re-reading records excludes concurrently discarded/changed documents. A provider failure leaves the missing document pending: the next search or backfill retries, including after a process restart. Existing unchanged vectors survive restart; questions are embedded on every request.

After selecting and backing up the database and applying the additive migrations separately, run a backfill against that explicitly selected database:

```sh
npm run build --workspace=@ggaddak/be
DATABASE_URL=file:/absolute/path/to/selected.sqlite npm run search:backfill --workspace=@ggaddak/be -- guild-id
```

Omit `guild-id` to index all eligible guilds from the operator command. This command performs real provider calls and stores vectors, so select the intended database and configure credentials first. It does not initialize, reset, or migrate a database. A failure returns a nonzero exit status; rerunning reuses completed vectors and retries missing ones.

SQLite stores JSON vectors and the service ranks a guild's eligible records in memory. This is an intentionally simple exact cosine index for current data volume, with linear document scans and sequential embedding of missing documents. Backfill before enabling search on a large historical corpus. No production database was changed during implementation.
