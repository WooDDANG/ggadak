import { Controller, Route, Tags, Get } from 'tsoa';
import { Service } from 'typedi';
import { HarvestingPolicyDto } from '../../dto/policy.dto.js';
import { PolicyService } from '../../services/policy.service.js';

@Tags('Policy')
@Route('api/config/policy')
@Service()
export class PolicyController extends Controller {
  constructor(private service: PolicyService) {
    super();
  }

  @Get('')
  public async get(): Promise<HarvestingPolicyDto> {
    return this.service.getPolicy();
  }
}
