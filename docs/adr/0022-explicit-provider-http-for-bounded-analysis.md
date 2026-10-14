# Explicit provider HTTP for bounded analysis

The durable Agentic workflow needs an instance-specific transport, a cancellable deadline, one visible provider request per attempt, and raw results for a bounded repair. The installed legacy OpenAI SDK adapter does not expose an instance-specific fetch boundary; relying on SDK retries also makes persisted attempt budgets harder to audit.

For BE decision analysis we use native Gemini/OpenAI HTTP inside the existing provider-agnostic AI Adapter. Zod remains the schema authority: the Adapter sends JSON Schema, handles provider errors and usage, and the workflow validates structure and meaning before publication. This supersedes the BE transport choice in [ADR-0006](0006-vercel-ai-sdk-and-zod-structured-outputs.md) and [ADR-0014](0014-multi-decision-llm-extraction-engine.md); it does not change the Service/Adapter boundary.

We accept responsibility for maintaining provider request/response contracts and verify them with injected HTTP fixtures. Adding another provider requires an explicit Adapter implementation; no implicit SDK retry or global fetch replacement is used. Real provider connectivity and model quality remain separate opt-in evaluations.
