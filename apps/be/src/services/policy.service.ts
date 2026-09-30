import { Service } from 'typedi';
import { getHarvestingPolicyFromEnv, HarvestingPolicyConfig } from '@ggaddak/shared';

@Service()
export class PolicyService {
  getPolicy(): HarvestingPolicyConfig {
    return getHarvestingPolicyFromEnv();
  }
}
