# Web-Owned Decision Review

Status: accepted (design agreed; implementation pending)

The Web Review Queue owns human confirmation, replacement, and independent retention of Decision Candidates. A Draft cannot alter a confirmed Decision Record. Confirming a replacement must commit the predecessor's Superseded transition and the successor's Decided transition in one transaction. This centralizes lifecycle rules instead of maintaining separate Discord and Web approval paths.

This supersedes [ADR-0002](./0002-interactive-decision-conflict-resolution.md)'s Discord conflict-confirmation requirement. Automated channel interaction remains reaction-only. Review links are provided through private command responses rather than automatic channel messages. Failed and canceled attempts must clean up processing reactions.

Semantic intent, explicit agreement, qualifying user reactions, or a manual request may admit discussion for analysis. Admission produces a candidate, not an automatically confirmed record. Bot-owned processing reactions such as 👀 and 📝 do not count as human agreement. The backend owns a shared detection policy used by both Bot and BE. Keep the current semantic threshold initially and validate Korean and English examples before changing it.

Topic matches within the same guild provide comparison candidates, not proof of conflict or Pivot. A reviewer chooses a particular predecessor for replacement or independently confirms the new record. Supersede and strategic Pivot are distinct concepts. On replacement, reviewers explicitly cancel or transfer each unfinished Action Item; completed items remain in the predecessor's history.

Reviews carry the versions read by the reviewer. A stale edit, approval, or replacement is rejected so the reviewer can reload current records. Replacement checks the candidate and predecessor versions and verifies that the predecessor remains Decided within the same transaction as the state changes and Action Item disposition.
