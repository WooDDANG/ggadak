import http from 'node:http';
import express, { Express } from 'express';
import { DecisionRepository } from './repositories/decision.repository.js';
import { IAiAdapter } from './adapters/ai.adapter.js';
import { initLoaders } from './loaders/index.js';

export async function createApp(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
): Promise<Express> {
  const app = express();
  await initLoaders({ expressApp: app, repo, aiAdapter });
  return app;
}

export async function createServer(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
): Promise<http.Server> {
  const app = await createApp(repo, aiAdapter);
  return http.createServer(app);
}
