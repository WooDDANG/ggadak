import http from 'node:http';
import express, { Express } from 'express';
import { DecisionRepository } from './repositories/decision.repository.js';
import { IAiAdapter } from './adapters/ai.adapter.js';
import { initLoaders } from './loaders/index.js';

export function createApp(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
): Express {
  const app = express();
  initLoaders({ expressApp: app, repo, aiAdapter });
  return app;
}

export function createServer(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
): http.Server {
  const app = createApp(repo, aiAdapter);
  return http.createServer(app);
}
