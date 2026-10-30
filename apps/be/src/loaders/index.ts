import 'reflect-metadata';
import { SyncJobService } from '../services/sync-job.service.js';
import {
  SyncJobsController,
  InternalSyncJobsController,
} from '../api/controllers/sync-jobs.controller.js';
import { AnalysisQueryService } from '../services/analysis-query.service.js';
import { DashboardService } from '../services/dashboard.service.js';
import { AnalysisQueueService } from '../services/analysis-queue.service.js';
import { AnalysisQueueController } from '../api/controllers/analysis-queue.controller.js';
import { AnalysisRequestController } from '../api/controllers/analysis-request.controller.js';
import { DashboardController } from '../api/controllers/dashboard.controller.js';
import { SearchService, EmbeddingProvider } from '../services/search.service.js';
import { SearchController } from '../api/controllers/search.controller.js';
import { ChannelsService } from '../services/channels.service.js';
import { HttpDiscordBotInstallationAdapter } from '../adapters/discord-bot-installation.adapter.js';
import { BotInstallationService } from '../services/bot-installation.service.js';
import { BotInstallationController } from '../api/controllers/bot-installation.controller.js';
import {
  ChannelsController,
  InternalMonitoringController,
} from '../api/controllers/channels.controller.js';
import { AuthController } from '../api/controllers/auth.controller.js';
import { V1DecisionController } from '../api/controllers/v1-decision.controller.js';
import { randomUUID } from 'node:crypto';
import { AuthService, AuthOptions } from '../services/auth.service.js';
import { Express } from 'express';
import { Container } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AiAdapter, IAiAdapter } from '../adapters/ai.adapter.js';
import { PolicyService } from '../services/policy.service.js';
import { CheckpointService } from '../services/checkpoint.service.js';
import { FeedbackService } from '../services/feedback.service.js';
import { DecisionService } from '../services/decision.service.js';
import { DiscussionService } from '../services/discussion.service.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';
import { PolicyController } from '../api/controllers/policy.controller.js';
import { CheckpointController } from '../api/controllers/checkpoint.controller.js';
import { FeedbackController } from '../api/controllers/feedback.controller.js';
import { DiscussionController } from '../api/controllers/discussion.controller.js';
import { initExpress } from './express.js';
import { initPrisma } from './prisma.js';
import { appLogger } from './logger.js';
import { assertStorageReady } from '../repositories/storage-readiness.js';

export interface LoaderOptions {
  expressApp: Express;
  repo?: DecisionRepository;
  aiAdapter?: IAiAdapter;
  authOptions?: AuthOptions;
  embeddingProvider?: EmbeddingProvider;
}

export async function initLoaders({
  expressApp,
  authOptions,
  embeddingProvider,
  repo: customRepo,
  aiAdapter: customAiAdapter,
}: LoaderOptions): Promise<{
  repo: DecisionRepository;
  aiAdapter: IAiAdapter;
  prisma: import('@prisma/client').PrismaClient;
}> {
  const container = Container.of(randomUUID());
  expressApp.locals.container = container;

  // 1. Prisma Client Loader
  const prisma = customRepo?.prisma ?? initPrisma();
  await prisma.$connect();
  await assertStorageReady(prisma);
  // Ensure migrated domain tables are queryable before routes become ready.
  await Promise.all([
    prisma.decision.findFirst(),
    prisma.externalFeedback.findFirst(),
    prisma.channelCheckpoint.findFirst(),
    prisma.rejectedEvidenceHash.findFirst(),
    prisma.analysisDelivery.findFirst(),
    prisma.analysisRetryCommand.findFirst(),
    prisma.analysisDeliveryHeartbeat.findFirst(),
  ]);

  // 2. Database Loader
  const repo = customRepo || new DecisionRepository(prisma);
  container.set(DecisionRepository, repo);

  // 3. AI Adapter Loader
  const aiAdapter = customAiAdapter || Container.get(AiAdapter);
  container.set(AiAdapter, aiAdapter);

  const authService = new AuthService(prisma, authOptions);
  container.set(AuthService, authService);
  container.set(
    DashboardController,
    new DashboardController(new DashboardService(repo), authService),
  );
  container.set(
    SearchController,
    new SearchController(new SearchService(repo, embeddingProvider), authService),
  );
  expressApp.locals.authService = authService;

  const channelsService = new ChannelsService(prisma, authOptions?.channelAdapter);
  container.set(ChannelsService, channelsService);
  container.set(ChannelsController, new ChannelsController(channelsService, authService));
  container.set(InternalMonitoringController, new InternalMonitoringController(channelsService));
  expressApp.locals.serviceToken = authOptions?.serviceToken ?? process.env.BOT_SERVICE_TOKEN;

  const botInstallationAdapter =
    authOptions?.botInstallationAdapter ?? new HttpDiscordBotInstallationAdapter();
  const botInstallationService = new BotInstallationService(botInstallationAdapter, {
    clientId: authOptions?.config?.clientId,
    now: authOptions?.now,
  });
  container.set(BotInstallationService, botInstallationService);
  container.set(
    BotInstallationController,
    new BotInstallationController(botInstallationService, authService),
  );

  // 4. Service Layer Binding
  const core = new DecisionExtractorCore();
  const policyService = new PolicyService();
  const checkpointService = new CheckpointService(repo);
  const feedbackService = new FeedbackService(repo);
  const decisionService = new DecisionService(repo);
  const discussionService = new DiscussionService(repo, aiAdapter as AiAdapter, core);
  const syncJobs = new SyncJobService(repo);
  container.set(SyncJobService, syncJobs);
  container.set(SyncJobsController, new SyncJobsController(syncJobs, authService));
  container.set(InternalSyncJobsController, new InternalSyncJobsController(syncJobs));
  const analysisQueue = new AnalysisQueueService(repo, discussionService);
  expressApp.locals.analysisQueue = analysisQueue;
  container.set(AnalysisQueueController, new AnalysisQueueController(analysisQueue));

  container.set(DecisionExtractorCore, core);
  container.set(PolicyService, policyService);
  container.set(CheckpointService, checkpointService);
  container.set(FeedbackService, feedbackService);
  container.set(DecisionService, decisionService);
  container.set(DiscussionService, discussionService);
  container.set(
    AnalysisRequestController,
    new AnalysisRequestController(new AnalysisQueryService(repo), authService),
  );

  // 5. Controller Layer Binding for TSOA IoC Container
  container.set(PolicyController, new PolicyController(policyService));
  container.set(CheckpointController, new CheckpointController(checkpointService));
  container.set(FeedbackController, new FeedbackController(feedbackService));
  container.set(DiscussionController, new DiscussionController(discussionService));

  container.set(AuthController, new AuthController(authService));
  container.set(V1DecisionController, new V1DecisionController(decisionService, authService));

  // 6. Express Loader (mounts TSOA RegisterRoutes)
  initExpress({ app: expressApp });

  appLogger.info('✌️ All loaders successfully initialized with TypeDI, Prisma & TSOA');

  return { repo, aiAdapter, prisma };
}

export default initLoaders;
