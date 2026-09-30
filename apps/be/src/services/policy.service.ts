import { getHarvestingPolicyFromEnv, HarvestingPolicyConfig } from '@ggaddak/shared';

export class PolicyService {
  getPolicy(): HarvestingPolicyConfig {
    return getHarvestingPolicyFromEnv();
  }
}
