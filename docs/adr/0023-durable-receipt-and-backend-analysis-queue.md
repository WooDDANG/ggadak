# Durable Receipt and Backend Analysis Queue

Status: accepted, implementation under verification

Bot delivery ends when BE durably stores the input and processing intent, rather than when AI finishes. BE owns the durable Analysis Queue, bounded retry, execution capacity and result replay. Bot delivery and result feedback run independently, so slow AI does not block receipt of another allowed channel. Channel transfers remain sequential; BE may permit B after receiving A while A's analysis is running, subject to byte and work limits.

Full-channel scans are stored in bounded segments and analyzed only after their immutable coverage declaration is complete. Missing input is selectively retransmitted; AI failure uses already received input. Oversized incomplete scans remain explicit capacity failures rather than waiting for analysis that cannot start. Failed channels remain recoverable while other channels may progress.

This refines ADR-0020's checkpoint ownership for the asynchronous path: BE advances only continuously analyzed scan coverage because it owns completion; Bot no longer polls or independently advances that path's checkpoints. The legacy synchronous path retains Bot acknowledgements. Neither event-triggered analysis nor durable receipt alone advances scan coverage. Request identity, evidence identity, human review and failure preservation rules remain unchanged.

Prisma/SQLite and the existing Bot file journal remain the storage boundary. HTTP carries bounded receipts and result queries initially; WebSocket/SSE is not assumed to solve AI/DB latency. Application receipts and persisted result acknowledgements remain necessary if the transport changes.
