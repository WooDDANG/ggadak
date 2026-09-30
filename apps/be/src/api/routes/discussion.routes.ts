import { Router } from 'express';
import { DiscussionController } from '../controllers/discussion.controller.js';
import { aiAnalyzeLimiter } from '../middlewares/rateLimiter.js';

export function createDiscussionRouter(controller: DiscussionController): Router {
  const router = Router();
  router.post('/discussions/analyze', aiAnalyzeLimiter, controller.analyzeDiscussion);
  return router;
}
