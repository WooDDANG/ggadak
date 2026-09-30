import 'reflect-metadata';
import { Express } from 'express';
import { Container } from 'typedi';
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
import { initPrisma, PrismaService } from './prisma.js';
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
}: LoaderOptions): Promise<{ repo: DecisionRepository; aiAdapter: IAiAdapter; prisma: PrismaService }> {
  // 1. Prisma Client Loader
  const prisma = initPrisma();
  await prisma.connect().catch((err: any) => {
    appLogger.warn(`Prisma connect warning: ${err.message}`);
  });

  // 2. Database Loader
  const repo = customRepo || new DecisionRepository(prisma);
  Container.set(DecisionRepository, repo);

  // 3. AI Adapter Loader
  const aiAdapter = customAiAdapter || Container.get(AiAdapter);
  Container.set(AiAdapter, aiAdapter);

  // 4. Service Layer Binding
  const policyService = new PolicyService();
  const checkpointService = new CheckpointService(repo);
  const feedbackService = new FeedbackService(repo);
  const decisionService = new DecisionService(repo);
  const discussionService = new DiscussionService(repo, aiAdapter as AiAdapter);

  Container.set(PolicyService, policyService);
  Container.set(CheckpointService, checkpointService);
  Container.set(FeedbackService, feedbackService);
  Container.set(DecisionService, decisionService);
  Container.set(DiscussionService, discussionService);

  // 5. Controller Layer Binding for TSOA IoC Container
  Container.set(PolicyController, new PolicyController(policyService));
  Container.set(CheckpointController, new CheckpointController(checkpointService));
  Container.set(FeedbackController, new FeedbackController(feedbackService));
  Container.set(DecisionController, new DecisionController(decisionService));
  Container.set(DiscussionController, new DiscussionController(discussionService));

  // 6. Express Loader (mounts TSOA RegisterRoutes)
  initExpress({ app: expressApp });

  appLogger.info('✌️ All loaders successfully initialized with TypeDI, Prisma & TSOA');

  return { repo, aiAdapter, prisma };
}

export default initLoaders;
