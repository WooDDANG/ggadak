import { Router } from 'express';
import { PolicyController } from '../controllers/policy.controller.js';
import { DiscussionController } from '../controllers/discussion.controller.js';
import { DecisionController } from '../controllers/decision.controller.js';
import { FeedbackController } from '../controllers/feedback.controller.js';
import { CheckpointController } from '../controllers/checkpoint.controller.js';

export interface RouterControllers {
  policyController: PolicyController;
  discussionController: DiscussionController;
  decisionController: DecisionController;
  feedbackController: FeedbackController;
  checkpointController: CheckpointController;
}

export function createApiRouter(controllers: RouterControllers): Router {
  const router = Router();

  // 1. Policy Configuration
  router.get('/config/policy', controllers.policyController.getPolicy);

  // 2. Discussion Analysis
  router.post('/discussions/analyze', controllers.discussionController.analyzeDiscussion);

  // 3. Decision Review
  router.post('/decisions/:id/review', controllers.decisionController.reviewDecision);

  // 4. Conflict Resolution
  router.post('/decisions/resolve-conflict', controllers.decisionController.resolveConflict);

  // 5. Query Decisions
  router.get('/decisions', controllers.decisionController.getDecisions);

  // 6. Webhook Decision Ingestion
  router.post('/webhooks/decisions', controllers.decisionController.ingestWebhook);

  // 7. External Feedbacks
  router.get('/feedbacks', controllers.feedbackController.getFeedbacks);
  router.post('/feedbacks', controllers.feedbackController.saveFeedback);

  // 8. Channel Checkpoints
  router.get('/channels/:channelId/checkpoint', controllers.checkpointController.getCheckpoint);
  router.post('/channels/:channelId/checkpoint', controllers.checkpointController.saveCheckpoint);

  return router;
}
