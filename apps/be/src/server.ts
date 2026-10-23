import 'reflect-metadata';
import { AnalysisPolicy, DeliveryPolicy } from '@ggaddak/shared';
import type { EmbeddingProvider } from './services/search.service.js';
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
  embeddingProvider?: EmbeddingProvider,
): Promise<Express> {
  const app = express();
  await initLoaders({ expressApp: app, repo, aiAdapter, authOptions, embeddingProvider });
  return app;
}

export async function createServer(
  repo?: DecisionRepository,
  aiAdapter?: IAiAdapter,
  authOptions?: AuthOptions,
  embeddingProvider?: EmbeddingProvider,
): Promise<http.Server> {
  const app = await createApp(repo, aiAdapter, authOptions, embeddingProvider);
  const server = http.createServer(app);
  let timer: NodeJS.Timeout | undefined;
  let maintenance: NodeJS.Timeout | undefined;
  server.on('listening', () => {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () =>
      void app.locals.analysisQueue
        .runOnce()
        .catch((error: Error) => (app.locals.queueError = error.message));
    timer = setInterval(tick, AnalysisPolicy.workerIntervalMs);
    timer.unref();
    tick();
    maintenance = setInterval(
      () =>
        void app.locals.analysisQueue
          .cleanup()
          .catch((error: Error) => (app.locals.queueError = error.message)),
      DeliveryPolicy.maintenanceIntervalMs,
    );
    maintenance.unref();
  });
  server.on('close', () => {
    if (timer) clearInterval(timer);
    if (maintenance) clearInterval(maintenance);
  });
  return server;
}
