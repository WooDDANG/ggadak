import { Router } from 'express';
import { PolicyController } from '../controllers/policy.controller.js';

export function createPolicyRouter(controller: PolicyController): Router {
  const router = Router();
  router.get('/config/policy', controller.getPolicy);
  return router;
}
