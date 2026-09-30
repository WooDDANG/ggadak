# 03 — TSOA Decorator-Driven Controllers & Swagger UI Generation

**What to build:**
Refactor backend controllers using TSOA decorators (`@Route`, `@Get`, `@Post`, `@Body`, `@Query`), automatically generating type-safe Express routes and serving OpenAPI / Swagger UI at `/api-docs`.

**Blocked by:**
02 — TypeDI Dependency Injection Container Setup

**Status:** ready-for-agent

- [ ] `tsoa.json` configured pointing to controllers, outputting routes to `src/build/routes.ts` and swagger to `src/build/swagger.json`.
- [ ] `DecisionController`, `DiscussionController`, `FeedbackController`, `CheckpointController`, and `PolicyController` rewritten with TSOA decorators and DTO types.
- [ ] `loaders/express.ts` updated with `RegisterRoutes(app)` and `swagger-ui-express` mounted at `/api-docs`.
- [ ] NPM scripts `swagger` (`tsoa spec-and-routes`) and `prebuild` added to `package.json`.
