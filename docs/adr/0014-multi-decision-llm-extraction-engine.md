# Multi-Decision AI Extraction Engine with Consensus Verification

We implement the AI extraction engine in `@ggaddak/be` supporting multi-decision arrays from single discussion transcripts, strict consensus verification (rejecting unconfirmed proposals as false positives), and Korean developer few-shot prompts using the Vercel AI SDK (`ai` + provider adapters for Gemini, OpenAI, and Claude).

## Policy amendment — 2026-10-14

The exclusion of unconfirmed proposals is superseded by the agreed [candidate semantics decision](../../.scratch/be-agentic-decision-design/issues/02-candidate-semantics.md). The Agentic workflow implements this policy; the original single-call algorithm is retained only as an evaluation baseline. Human confirmation remains required under [ADR-0019](0019-web-owned-decision-review.md).

The BE provider transport choice is superseded by [ADR-0022](0022-explicit-provider-http-for-bounded-analysis.md).
