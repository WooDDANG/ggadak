# Vercel AI SDK and Zod for Structured Decision Extraction

We use the Vercel AI SDK (`ai`) with `zod` schemas (`generateObject`) to guarantee deterministic JSON output schemas for Decisions, Rationales, and Action Items while remaining agnostic to the underlying LLM provider.

The BE Agentic workflow transport choice is superseded by [ADR-0022](0022-explicit-provider-http-for-bounded-analysis.md). Zod schemas and the provider-agnostic Adapter boundary remain in use.
