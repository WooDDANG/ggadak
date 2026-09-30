import http from 'node:http';
import express, { Express } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createLogger } from '@ggaddak/shared';
import { DecisionRepository } from './db.js';
import { BackendExtractionEngine } from './extractor/engine.js';
import { PolicyService } from './services/policy.service.js';
import { CheckpointService } from './services/checkpoint.service.js';
import { FeedbackService } from './services/feedback.service.js';
import { DecisionService } from './services/decision.service.js';
import { DiscussionService } from './services/discussion.service.js';
import { PolicyController } from './controllers/policy.controller.js';
import { CheckpointController } from './controllers/checkpoint.controller.js';
import { FeedbackController } from './controllers/feedback.controller.js';
import { DecisionController } from './controllers/decision.controller.js';
import { DiscussionController } from './controllers/discussion.controller.js';
import { createApiRouter } from './routes/router.js';

export function createApp(
  repo: DecisionRepository,
  extractor = new BackendExtractionEngine(),
): Express {
  const logger = createLogger('BE');
  const app = express();

  // 1. Initialize Services
  const policyService = new PolicyService();
  const checkpointService = new CheckpointService(repo);
  const feedbackService = new FeedbackService(repo);
  const decisionService = new DecisionService(repo);
  const discussionService = new DiscussionService(repo, extractor);

  // 2. Initialize Controllers
  const policyController = new PolicyController(policyService);
  const checkpointController = new CheckpointController(checkpointService);
  const feedbackController = new FeedbackController(feedbackService);
  const decisionController = new DecisionController(decisionService);
  const discussionController = new DiscussionController(discussionService);

  // 3. Middlewares
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Morgan HTTP logging
  app.use(
    morgan('":method :url" :status :res[content-length] - :response-time ms', {
      stream: {
        write: (message: string) => logger.info(`[HTTP] ${message.trim()}`),
      },
    }),
  );

  // 4. Health Check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
  });

  // 5. Mount API Routes
  const apiRouter = createApiRouter({
    policyController,
    checkpointController,
    feedbackController,
    decisionController,
    discussionController,
  });
  app.use('/api', apiRouter);

  return app;
}

export function createServer(
  repo: DecisionRepository,
  extractor = new BackendExtractionEngine(),
): http.Server {
  const app = createApp(repo, extractor);
  return http.createServer(app);
}
