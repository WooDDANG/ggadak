import { Router } from 'express';
import { CheckpointController } from '../controllers/checkpoint.controller.js';

export function createCheckpointRouter(controller: CheckpointController): Router {
  const router = Router();
  router.get('/channels/:channelId/checkpoint', controller.getCheckpoint);
  router.post('/channels/:channelId/checkpoint', controller.saveCheckpoint);
  return router;
}
