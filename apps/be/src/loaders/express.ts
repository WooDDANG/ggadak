import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createLogger } from '@ggaddak/shared';
import { ApiControllers, createApiRouter } from '../api/routes/index.js';
import { errorHandler } from '../api/middlewares/errorHandler.js';
import { apiLimiter } from '../api/middlewares/rateLimiter.js';

export function initExpress({
  app,
  controllers,
}: {
  app: Express;
  controllers: ApiControllers;
}): void {
  const logger = createLogger('EXPRESS-LOADER');

  // 1. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows flexible local FE dashboard script loading
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 2. CORS
  app.use(cors());

  // 3. Body Parsing
  app.use(express.json({ limit: '10mb' }));

  // 4. Rate Limiter for general API protection
  app.use('/api', apiLimiter);

  // 5. Morgan Logging with Winston stream
  app.use(
    morgan('":method :url" :status :res[content-length] - :response-time ms', {
      stream: {
        write: (message: string) => logger.info(`[HTTP] ${message.trim()}`),
      },
    }),
  );

  // 6. Health & Status Check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
  });
  app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // 7. Mount API Sub-Routers
  const apiRouter = createApiRouter(controllers);
  app.use('/api', apiRouter);

  // 8. 404 Route Handler
  app.use((req, res) => {
    logger.warn(`[HTTP] Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not Found' });
  });

  // 9. Centralized Error Handler Middleware (must be last)
  app.use(errorHandler);

  logger.info('✌️ Express base, security (Helmet/RateLimit), routes, and error handler configured');
}
