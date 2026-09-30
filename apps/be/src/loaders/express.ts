import fs from 'node:fs';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';
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

  // 6. Swagger UI Docs (/api-docs)
  try {
    const swaggerDocPath = path.resolve(process.cwd(), 'src/api/docs/swagger.json');
    if (fs.existsSync(swaggerDocPath)) {
      const swaggerDocument = JSON.parse(fs.readFileSync(swaggerDocPath, 'utf-8'));
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
      logger.info('✌️ Swagger UI documentation mounted at /api-docs');
    }
  } catch (err: any) {
    logger.warn(`Failed to initialize Swagger UI: ${err.message}`);
  }

  // 7. Health & Status Check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
  });
  app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // 8. Mount API Sub-Routers
  const apiRouter = createApiRouter(controllers);
  app.use('/api', apiRouter);

  // 9. 404 Route Handler
  app.use((req, res) => {
    logger.warn(`[HTTP] Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not Found' });
  });

  // 10. Centralized Error Handler Middleware (must be last)
  app.use(errorHandler);

  logger.info('✌️ Express base, security (Helmet/RateLimit), routes, Swagger, and error handler configured');
}
