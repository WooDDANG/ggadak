import { Express } from 'express';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AiAdapter, IAiAdapter } from '../adapters/ai.adapter.js';
import { PolicyService } from '../services/policy.service.js';
import { CheckpointService } from '../services/checkpoint.service.js';
import { FeedbackService } from '../services/feedback.service.js';
import { DecisionService } from '../services/decision.service.js';
import { DiscussionService } from '../services/discussion.service.js';
import { PolicyController } from '../api/controllers/policy.controller.js';
import { CheckpointController } from '../api/controllers/checkpoint.controller.js';
import { FeedbackController } from '../api/controllers/feedback.controller.js';
import { DecisionController } from '../api/controllers/decision.controller.js';
import { DiscussionController } from '../api/controllers/discussion.controller.js';
import { initExpress } from './express.js';
import { initDatabase } from './database.js';
import { appLogger } from './logger.js';

export interface LoaderOptions {
  expressApp: Express;
  repo?: DecisionRepository;
  aiAdapter?: IAiAdapter;
}

export async function initLoaders({
  expressApp,
  repo: customRepo,
  aiAdapter: customAiAdapter,
}: LoaderOptions): Promise<{ repo: DecisionRepository; aiAdapter: IAiAdapter }> {
  // 0. Database Loader
  const repo = customRepo || initDatabase();

  // 1. AI Adapter Loader
  const aiAdapter = customAiAdapter || new AiAdapter();

  // 2. Services Layer
  const policyService = new PolicyService();
  const checkpointService = new CheckpointService(repo);
  const feedbackService = new FeedbackService(repo);
  const decisionService = new DecisionService(repo);
  const discussionService = new DiscussionService(repo, aiAdapter);

  // 3. Controllers Layer
  const policyController = new PolicyController(policyService);
  const checkpointController = new CheckpointController(checkpointService);
  const feedbackController = new FeedbackController(feedbackService);
  const decisionController = new DecisionController(decisionService);
  const discussionController = new DiscussionController(discussionService);

  // 4. Express Loader
  initExpress({
    app: expressApp,
    controllers: {
      policyController,
      checkpointController,
      feedbackController,
      decisionController,
      discussionController,
    },
  });

  appLogger.info('✌️ All loaders successfully initialized');

  return { repo, aiAdapter };
}

export default initLoaders;
