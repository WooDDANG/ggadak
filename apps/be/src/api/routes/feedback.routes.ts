import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller.js';

export function createFeedbackRouter(controller: FeedbackController): Router {
  const router = Router();
  router.get('/feedbacks', controller.getFeedbacks);
  router.post('/feedbacks', controller.saveFeedback);
  return router;
}
