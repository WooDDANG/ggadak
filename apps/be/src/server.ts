import type { AuthOptions } from './services/auth.service.js';
import http from 'node:http';
import express, { Express } from 'express';
import { DecisionRepository } from './repositories/decision.repository.js';
import { IAiAdapter } from './adapters/ai.adapter.js';
import { initLoaders } from './loaders/index.js';

export async function createApp(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
  authOptions?: AuthOptions,
): Promise<Express> {
  const app = express();
  await initLoaders({ expressApp: app, repo, aiAdapter, authOptions });
  return app;
}

export async function createServer(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
  authOptions?: AuthOptions,
): Promise<http.Server> {
  const app = await createApp(repo, aiAdapter, authOptions);
  return http.createServer(app);
}
