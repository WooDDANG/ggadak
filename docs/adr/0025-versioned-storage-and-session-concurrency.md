# Versioned storage and bounded session concurrency

Decision domain payloads are the validated storage authority; indexed columns are derived query projections. Legacy fields are archived before expand/data/contract migration, and candidate relationships use indexed, restrictive references. This refines ADR-0018 while preserving historical evidence and missing historical values.

Independent discussion sessions may run through a bounded worker pool. Their immutable inputs and mutable checkpoints are stored separately, and a shared leased FIFO scheduler limits AI stage calls across BE processes. Per-session stage order, same-channel request serialization, bounded repair and atomic publication remain unchanged. Parallelism is configured from measured throughput, latency, error and resource budgets; the default remains one and fixture measurements do not establish real AGY capacity.

2026-11-19: 코드 기본값은 1 그대로 둔다. NVIDIA 키 4개 운영에서는 실측(`.scratch/parallel-session-analysis/reports/2026-11-19-concurrency-three-live.md`, 250초 → 126초, 키 대기 0)을 근거로 `AI_CALL_CONCURRENCY`·`AI_SESSION_CONCURRENCY`를 3으로 설정하고 키 1개를 예비로 남긴다. 요청 전체 실패 시 처리 중인 형제 세션은 끊지 않고 마무리한다.
