import { Controller, Route, Tags, Get } from 'tsoa';
import { Service } from 'typedi';
import { Request, Response, NextFunction } from 'express';
import { HarvestingPolicyDto } from '../../dto/policy.dto.js';
import { PolicyService } from '../../services/policy.service.js';

@Tags('Policy')
@Route('api/policy')
@Service()
export class PolicyController extends Controller {
  constructor(private service: PolicyService) {
    super();
  }

  @Get('')
  public async get(): Promise<HarvestingPolicyDto> {
    return this.service.getPolicy();
  }

  getPolicy = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const policy = this.service.getPolicy();
      res.status(200).json(policy);
    } catch (err) {
      next(err);
    }
  };
}
