# Versioned storage and bounded session concurrency

Decision domain payloads are the validated storage authority; indexed columns are derived query projections. Legacy fields are archived before expand/data/contract migration, and candidate relationships use indexed, restrictive references. This refines ADR-0018 while preserving historical evidence and missing historical values.

Independent discussion sessions may run through a bounded worker pool. Their immutable inputs and mutable checkpoints are stored separately, and a shared leased FIFO scheduler limits AI stage calls across BE processes. Per-session stage order, same-channel request serialization, bounded repair and atomic publication remain unchanged. Parallelism is configured from measured throughput, latency, error and resource budgets; the default remains one and fixture measurements do not establish real AGY capacity.
