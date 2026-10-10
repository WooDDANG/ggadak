# Analysis Delivery and Scan Coverage

Status: accepted (design agreed; implementation pending)

Channel Checkpoint means the end of a continuously completed channel scan range. Completing an isolated event-triggered Harvesting Window does not establish that earlier channel messages were scanned and must not advance this checkpoint. The Bot advances scan progress only after completed analysis is acknowledged; the backend must persist the checkpoint rather than independently advancing it from an analysis trigger.

Each analysis request receives a stable ID when durably queued. Retries retain that ID, and the backend returns a previously completed result instead of extracting and saving candidates again. Explicit manual reanalysis receives a new request ID, with overlapping-candidate detection handled separately. This separates delivery retries from intentional reanalysis.

Transient failures receive bounded retries with increasing delay. Permanent errors and exhausted attempts remain retained failures, visible on the Web with a manual retry action; they are not removed or counted as successfully analyzed. Each channel runs one analysis at a time. Later triggers wait rather than being dropped, and manual requests bypass debounce but not the channel's execution lock. Debounce coalescing must settle every affected caller and clean up obsolete processing reactions.

Later scan ranges may complete while an earlier range has failed. Persist their completion separately, but hold the checkpoint before the gap until that range succeeds. A retry or retained failure must not indefinitely monopolize a channel's execution slot.

Across different requests, reuse a candidate only when its canonical evidence and normalized decision content are both identical. Partial evidence overlap or different wording creates a related candidate for human comparison, not automatic deletion. A manual reanalysis may bypass rejected-evidence suppression and must link new candidates to their previous analysis or candidate history, while leaving rejected and confirmed records intact. Automatic analysis continues to respect rejected evidence.

These rules refine [ADR-0016](./0016-autonomous-stream-tracking-and-checkpointing.md)'s checkpoint and locking commitments and implement [ADR-0018](./0018-durable-analysis-and-database-authority.md)'s durable retry direction.
