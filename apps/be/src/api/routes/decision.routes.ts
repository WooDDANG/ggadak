import { Router } from 'express';
import { DecisionController } from '../controllers/decision.controller.js';

export function createDecisionRouter(controller: DecisionController): Router {
  const router = Router();
  router.get('/decisions', controller.getDecisions);
  router.post('/decisions/:id/review', controller.reviewDecision);
  router.post('/decisions/resolve-conflict', controller.resolveConflict);
  router.post('/webhooks/decisions', controller.ingestWebhook);
  return router;
}
