# 04 — Bot Layered Handlers, Services & Views Alignment

**What to build:**
Refactor and align the Discord bot architecture with modular event handlers (`MessageHandler`, `ReactionHandler`, `InteractionHandler`), domain services (`BackendApiService`, `HarvesterService`), and presentation views (`BotEmbedView`).

**Blocked by:**
03 — Modular API Routes & Express Controllers

**Status:** ready-for-agent

- [ ] `BotEmbedView` rendering color-coded Discord Embeds for DRAFT candidates, pivot warnings, and conflict prompts.
- [ ] `BackendApiService` communicating cleanly with backend REST endpoints with fault tolerance and logging.
- [ ] `HarvesterService` handling thread prioritization, asymmetric context window harvesting (15 before / 5 after), and interval merging.
- [ ] `MessageHandler` with consensus regex matching and per-channel debouncing.
- [ ] `ReactionHandler` managing 📌 manual override and reaction thresholds.
- [ ] `InteractionHandler` handling slash commands (`/피드백입력`, `/스캔`) and button interactions.
