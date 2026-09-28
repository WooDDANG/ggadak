# Hybrid Ingestion Model for Discord Conversations

We use explicit user triggers (emoji reactions / slash commands) combined with scheduled batch summaries rather than continuous passive streaming to capture Discord messages. This minimizes LLM token consumption and chat noise while ensuring critical decisions and scheduled summaries are reliably recorded.
