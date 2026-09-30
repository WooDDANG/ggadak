import { Request, Response, NextFunction } from 'express';
import { PolicyService } from '../../services/policy.service.js';

export class PolicyController {
  constructor(private service: PolicyService) {}

  getPolicy = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const policy = this.service.getPolicy();
      res.status(200).json(policy);
    } catch (err) {
      next(err);
    }
  };
}
