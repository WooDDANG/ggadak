# Unified Winston Logger and Morgan HTTP Streaming

We standardize logging across `@ggaddak/bot` and `@ggaddak/be` by creating a shared Winston logger factory in `@ggaddak/shared` with console colorization, error-level splitting, and daily file rotation in `logs/`. For HTTP access logging in `@ggaddak/be`, `morgan` is integrated to stream request/response timings directly into Winston's `http` level.
