import { Router } from 'express';
import { DecisionController } from '../controllers/decision.controller.js';
import { DiscussionController } from '../controllers/discussion.controller.js';
import { FeedbackController } from '../controllers/feedback.controller.js';
import { CheckpointController } from '../controllers/checkpoint.controller.js';
import { PolicyController } from '../controllers/policy.controller.js';
import { createDecisionRouter } from './decision.routes.js';
import { createDiscussionRouter } from './discussion.routes.js';
import { createFeedbackRouter } from './feedback.routes.js';
import { createCheckpointRouter } from './checkpoint.routes.js';
import { createPolicyRouter } from './policy.routes.js';

export interface ApiControllers {
  decisionController: DecisionController;
  discussionController: DiscussionController;
  feedbackController: FeedbackController;
  checkpointController: CheckpointController;
  policyController: PolicyController;
}

export function createApiRouter(controllers: ApiControllers): Router {
  const router = Router();

  router.use(createPolicyRouter(controllers.policyController));
  router.use(createDiscussionRouter(controllers.discussionController));
  router.use(createDecisionRouter(controllers.decisionController));
  router.use(createFeedbackRouter(controllers.feedbackController));
  router.use(createCheckpointRouter(controllers.checkpointController));

  return router;
}
