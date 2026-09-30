# Shared Context

Shared domain entities, Zod validation schemas, and API payload contracts shared between Bot and Web applications.

## Language

**Decision Candidate**:
An unverified draft proposal of a decision extracted from chat discussions by the AI engine, awaiting human confirmation in the Review Queue.
_Avoid_: Draft Decision, Temporary Decision, Suggestion, Scratch Note

**Decision Record**:
A finalized, verified conclusion confirmed by team members, archived with its Rationale, category, and action items.
_Avoid_: Final Decision, Note, Ticket, Document, Row

**Rationale**:
The explicit reasons, background context, and tradeoffs that led to a specific Decision Record.
_Avoid_: Reason, Context, Background, Justification

**Supersede**:
The formal invalidation and replacement of an older Decision Record by a newer Decision Record.
_Avoid_: Overwrite, Deprecate, Expire, Cancel

**Pivot**:
A strategic transformation in product direction, architecture, or core value proposition—a high-impact Supersede backed by External Feedback.
_Avoid_: Direction Change, Shift, Course Correction

**External Feedback**:
Qualitative evaluations and critique collected from outside stakeholders (professors, mentors, interviewees) injected into the decision analysis context.
_Avoid_: Comment, Review, Feedback Note, Evaluation

**Topic**:
A distinct subject or discussion domain from which Decisions emerge.
_Avoid_: Subject, Agenda, Issue, Thread

**Action Item**:
A concrete follow-up task assigned to a member as a direct consequence of a Decision Record.
_Avoid_: Task, Todo, Job, Work Item

**Decision State**:
The formal lifecycle status of a Decision (`Draft`, `Decided`, `Rejected`, `Superseded`).
_Avoid_: Status, Phase, Stage, Condition

**Decision Payload**:
The standardized JSON contract sent across systems containing Decision details, Rationale, Action Items, source references, and governance metadata.
_Avoid_: Webhook Body, Message Data, Export Object
