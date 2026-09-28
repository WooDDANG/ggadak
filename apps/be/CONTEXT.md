# BE Context

The backend REST API server managing persistent decision storage, search indexing, and webhook ingestion from the Bot.

## Language

**Decision Ingestion**:
The endpoint and pipeline responsible for authenticating and validating incoming Decision Payloads from the Bot daemon.
_Avoid_: Webhook Receiver, Bot Handler

**Decision Record**:
The persisted database entity representing an organizational Decision, its Rationale, and historical revisions.
_Avoid_: Note, Ticket, Document, Row
