import http from 'node:http';
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
import { AppRouter } from './routes/router.js';

export function createServer(repo: DecisionRepository, extractor = new BackendExtractionEngine()) {
  const logger = createLogger('BE');

  // 1. Initialize Service Layer
  const policyService = new PolicyService();
  const checkpointService = new CheckpointService(repo);
  const feedbackService = new FeedbackService(repo);
  const decisionService = new DecisionService(repo);
  const discussionService = new DiscussionService(repo, extractor);

  // 2. Initialize Controller Layer
  const policyController = new PolicyController(policyService);
  const checkpointController = new CheckpointController(checkpointService);
  const feedbackController = new FeedbackController(feedbackService);
  const decisionController = new DecisionController(decisionService);
  const discussionController = new DiscussionController(discussionService);

  // 3. Initialize Router Layer
  const router = new AppRouter({
    policyController,
    checkpointController,
    feedbackController,
    decisionController,
    discussionController,
  });

  // 4. Morgan HTTP logging middleware
  const morganMiddleware = morgan(
    '":method :url" :status :res[content-length] - :response-time ms',
    {
      stream: {
        write: (message: string) => logger.info(`[HTTP] ${message.trim()}`),
      },
    },
  );

  return http.createServer((req, res) => {
    morganMiddleware(req, res, () => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Delegate request handling to AppRouter
      router.handle(req, res);
    });
  });
}
