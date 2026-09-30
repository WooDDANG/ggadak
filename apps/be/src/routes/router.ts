import { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '@ggaddak/shared';
import { PolicyController } from '../controllers/policy.controller.js';
import { DiscussionController } from '../controllers/discussion.controller.js';
import { DecisionController } from '../controllers/decision.controller.js';
import { FeedbackController } from '../controllers/feedback.controller.js';
import { CheckpointController } from '../controllers/checkpoint.controller.js';

const logger = createLogger('BE-ROUTER');

export interface RouterControllers {
  policyController: PolicyController;
  discussionController: DiscussionController;
  decisionController: DecisionController;
  feedbackController: FeedbackController;
  checkpointController: CheckpointController;
}

export class AppRouter {
  constructor(private controllers: RouterControllers) {}

  handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const method = req.method;
    const path = url.pathname;

    // 1. Health Check
    if (method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    // 2. Policy Configuration: GET /api/config/policy
    if (method === 'GET' && path === '/api/config/policy') {
      this.controllers.policyController.getPolicy(req, res);
      return;
    }

    // 3. Discussion Analysis: POST /api/discussions/analyze
    if (method === 'POST' && path === '/api/discussions/analyze') {
      this.controllers.discussionController.analyzeDiscussion(req, res);
      return;
    }

    // 4. Decision Review: POST /api/decisions/:id/review
    const reviewMatch = path.match(/^\/api\/decisions\/([^/]+)\/review$/);
    if (method === 'POST' && reviewMatch) {
      this.controllers.decisionController.reviewDecision(req, res, reviewMatch[1]);
      return;
    }

    // 5. Conflict Resolution: POST /api/decisions/resolve-conflict
    if (method === 'POST' && path === '/api/decisions/resolve-conflict') {
      this.controllers.decisionController.resolveConflict(req, res);
      return;
    }

    // 6. External Feedbacks: GET & POST /api/feedbacks
    if (path === '/api/feedbacks') {
      if (method === 'GET') {
        this.controllers.feedbackController.getFeedbacks(req, res, url);
        return;
      }
      if (method === 'POST') {
        this.controllers.feedbackController.saveFeedback(req, res);
        return;
      }
    }

    // 7. Channel Checkpoints: GET & POST /api/channels/:channelId/checkpoint
    const checkpointMatch = path.match(/^\/api\/channels\/([^/]+)\/checkpoint$/);
    if (checkpointMatch) {
      const channelId = checkpointMatch[1];
      if (method === 'GET') {
        this.controllers.checkpointController.getCheckpoint(req, res, channelId);
        return;
      }
      if (method === 'POST') {
        this.controllers.checkpointController.saveCheckpoint(req, res, channelId);
        return;
      }
    }

    // 8. Ingest Webhook: POST /api/webhooks/decisions
    if (method === 'POST' && path === '/api/webhooks/decisions') {
      this.controllers.decisionController.ingestWebhook(req, res);
      return;
    }

    // 9. Query Decisions: GET /api/decisions
    if (method === 'GET' && path === '/api/decisions') {
      this.controllers.decisionController.getDecisions(req, res, url);
      return;
    }

    // 404 Route Not Found
    logger.warn(`[HTTP] Route not found: ${method} ${path}`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}
