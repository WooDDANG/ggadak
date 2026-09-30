# BE Context

The backend REST API server managing persistent decision storage, Review Queue lifecycle, AI extraction engine, and external feedback ingestion.

## Language

**Review Queue**:
The staging pipeline and query interface where Decision Candidates are held in Draft state until human leads confirm, edit, or reject them.
_Avoid_: Inbox, Approval List, Staging Area, Pending Tasks

**Decision Ingestion**:
The endpoint and pipeline responsible for authenticating and validating incoming Decision Payloads from the Bot daemon.
_Avoid_: Webhook Receiver, Bot Handler

**Decision Record**:
The persisted database entity representing a verified organizational Decision, its Rationale, and historical revisions.
_Avoid_: Note, Ticket, Document, Row

**Evidence Hash**:
A deterministic cryptographic hash generated from raw discussion messages to prevent duplicate extraction of previously rejected candidates.
_Avoid_: Anti-Duplicate Key, Message Fingerprint, Signature

**Governance Score**:
A 4-tier rubric score (1.0 to 4.0) measuring the consensus strength, participant diversity, and evidence density of a Decision Candidate.
_Avoid_: Quality Rating, Confidence Level, Priority Score
