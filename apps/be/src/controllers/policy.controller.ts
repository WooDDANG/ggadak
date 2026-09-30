import { Request, Response } from 'express';
import { PolicyService } from '../services/policy.service.js';

export class PolicyController {
  constructor(private service: PolicyService) {}

  getPolicy = (_req: Request, res: Response): void => {
    const policy = this.service.getPolicy();
    res.status(200).json(policy);
  };
}
