# 02 — TypeDI Dependency Injection Container Setup

**What to build:**
Establish TypeDI (`typedi` + `reflect-metadata`) across the backend services and adapters, enabling automated dependency resolution and seamless Mock injection during testing.

**Blocked by:**
01 — Prisma ORM Integration (Schema, Client & Type-Safe Repository)

**Status:** ready-for-agent

- [ ] `reflect-metadata` loaded in application entry point.
- [ ] Domain services (`DecisionService`, `DiscussionService`, `FeedbackService`, `CheckpointService`, `PolicyService`) annotated with `@Service()`.
- [ ] `AiAdapter` registered in the TypeDI Container with support for runtime mock replacement.
- [ ] `loaders/ioc.ts` implemented as the custom IoC container module for TSOA.
