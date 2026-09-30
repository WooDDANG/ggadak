---
triage: ready-for-agent
topic: discord-transcript-viewer
created: 2026-09-30
---

# Feature Specification: Frontend Discord Transcript Viewer & Context Inspector

## Problem Statement

When project managers (PMs) or team members review extracted decision candidates in the Review Queue or inspect past decisions on the Decision Timeline, they often need to verify the original conversation context (who proposed it, who agreed, what arguments were exchanged, and which emoji reactions were given). 

Previously, users only saw summarized decision contents and a link to the Discord message URL. Clicking external links disrupted their workflow, required opening the Discord desktop/web client, and did not clearly highlight which exact message within a multi-turn conversation triggered the consensus.

## Solution

Provide an embedded, collapsible, Discord-styled Conversation Transcript Viewer (`DiscordTranscriptViewer`) directly within each candidate and decision card in the Web Dashboard (Review Queue and Decision Timeline).

The viewer allows PMs to expand and inspect the 15-before / trigger / 5-after conversation window with:
- Author user avatar and name with consistent color coding
- Timestamp and reply thread indicators (`replyingTo`)
- Highlighted badge for the consensus trigger message (`🎯 합의 발화`)
- Aggregated emoji reaction badges with count indicators
- Full fallback to raw transcript text if structured message logs are not present

## User Stories

1. As a Project Manager reviewing candidates in the Review Queue, I want to expand the original Discord chat transcript within the card, so that I can verify the context without leaving the dashboard.
2. As a Project Manager, I want to see which exact utterance triggered the decision extraction highlighted with a `🎯 합의 발화` badge, so that I can pinpoint the moment of agreement immediately.
3. As a Project Manager, I want to view the emoji reactions attached to each Discord message in the thread, so that I can gauge the team's sentiment and consensus level.
4. As a Project Manager, I want to see reply indicators (`replyingTo`) on threaded messages, so that I can follow back-and-forth discussions accurately.
5. As a Team Member browsing the Decision Timeline, I want to inspect the historical discussion of decided or superseded items, so that I understand the rationale behind legacy decisions.
6. As a User with slow network or legacy data where structured message arrays are missing, I want the viewer to cleanly display the formatted `rawTranscript` string, so that I still have full access to the conversational context.
7. As a User reviewing many decisions at once, I want the transcript to stay collapsed by default with an accordion toggle, so that the dashboard interface remains clean and compact.
8. As a User, I want the channel name and total message count visible in the accordion summary header, so that I know the context size before expanding it.

## Implementation Decisions

### 1. Embedded UI Component Architecture
- Created a standalone, reusable transcript viewer module in the Frontend client application.
- Configured accordion state management per card instance (`isOpen`) with smooth UI transition.
- Implemented visual indicators for author initials, role-based color hashing, message timestamps, reply threads, trigger highlights, and reaction pills.

### 2. Integration Seams
- **Review Queue Seam**: Integrated the transcript viewer into each Draft/Proposed candidate card directly above the card footer actions.
- **Decision Timeline Seam**: Integrated the transcript viewer into each historical timeline card (Decided, Superseded, Deferred, Rejected) above the metadata footer.

### 3. Data Contract & Schema Handling
- Leveraged the existing `DiscordSource` schema containing `rawMessages` (`id`, `author`, `content`, `createdAt`, `replyingTo`, `reactionCount`, `reactions`, `isTrigger`) and `rawTranscript`.
- Component handles optional properties gracefully, hiding itself when no transcript information exists.

## Testing Decisions

### External Behavior Verification
- Verified end-to-end integration across the monorepo build pipeline (`npm run build`).
- Verified zero regression across all shared domain schema validations, backend session slicing tests, governance rubric scoring tests, and Discord bot harvesting modules (`npm test`).
- Verified responsive layout rendering across diverse screen widths.

### Prior Art
- Consistent with existing component design patterns in the Frontend application (Badge, Action Buttons, Governance Reason callouts).

## Out of Scope

- In-place real-time editing of Discord messages from the Web Dashboard.
- Sending new Discord replies or reactions directly from the Web Dashboard (read-only viewer).
- Audio / Voice channel recording transcription playback.

## Further Notes

- The feature utilizes the asymmetric context window (15 messages before trigger, 1 trigger, 5 messages after) captured during Discord bot harvesting.
- The web dashboard runs on port 3000 and connects to the backend API on port 3001.
