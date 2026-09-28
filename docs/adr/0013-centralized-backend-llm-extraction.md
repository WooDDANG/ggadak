# Centralized LLM Decision Extraction in Backend

We relocate the LLM decision extraction and conflict detection pipeline from `@ggaddak/bot` to `@ggaddak/be` (`POST /api/discussions/analyze`). The Discord bot operates as a lightweight gateway adapter harvesting raw message context and rendering interactive channel feedback, allowing the backend AI analysis engine to be reused across web inputs, Slack bots, and future integration channels.
