import { z } from 'zod';

export const HarvestingPolicyConfigSchema = z.object({
  initialScanLimit: z.number().int().positive().default(50),
  contextWindowBefore: z.number().int().positive().default(15),
  contextWindowAfter: z.number().int().positive().default(5),
  maxMergedWindow: z.number().int().positive().default(40),
  reactionThreshold: z.number().int().positive().default(3),
  debounceMs: z.number().int().positive().default(15000),
  agreementThreshold: z.number().int().positive().default(2),
  lookbackDays: z.number().int().positive().default(30)
});

export type HarvestingPolicyConfig = z.infer<typeof HarvestingPolicyConfigSchema>;

export const DEFAULT_HARVESTING_POLICY: HarvestingPolicyConfig = {
  initialScanLimit: 50,
  contextWindowBefore: 15,
  contextWindowAfter: 5,
  maxMergedWindow: 40,
  reactionThreshold: 3,
  debounceMs: 15000,
  agreementThreshold: 2,
  lookbackDays: 30
};

export function getHarvestingPolicyFromEnv(env: Record<string, string | undefined> = process.env): HarvestingPolicyConfig {
  return HarvestingPolicyConfigSchema.parse({
    initialScanLimit: env.SCAN_INITIAL_LIMIT ? parseInt(env.SCAN_INITIAL_LIMIT, 10) : DEFAULT_HARVESTING_POLICY.initialScanLimit,
    contextWindowBefore: env.CONTEXT_WINDOW_BEFORE ? parseInt(env.CONTEXT_WINDOW_BEFORE, 10) : DEFAULT_HARVESTING_POLICY.contextWindowBefore,
    contextWindowAfter: env.CONTEXT_WINDOW_AFTER ? parseInt(env.CONTEXT_WINDOW_AFTER, 10) : DEFAULT_HARVESTING_POLICY.contextWindowAfter,
    maxMergedWindow: env.MAX_MERGED_WINDOW ? parseInt(env.MAX_MERGED_WINDOW, 10) : DEFAULT_HARVESTING_POLICY.maxMergedWindow,
    reactionThreshold: env.REACTION_THRESHOLD ? parseInt(env.REACTION_THRESHOLD, 10) : DEFAULT_HARVESTING_POLICY.reactionThreshold,
    debounceMs: env.DEBOUNCE_MS ? parseInt(env.DEBOUNCE_MS, 10) : DEFAULT_HARVESTING_POLICY.debounceMs,
    agreementThreshold: env.AGREEMENT_THRESHOLD ? parseInt(env.AGREEMENT_THRESHOLD, 10) : DEFAULT_HARVESTING_POLICY.agreementThreshold,
    lookbackDays: env.DECISION_LOOKBACK_DAYS ? parseInt(env.DECISION_LOOKBACK_DAYS, 10) : DEFAULT_HARVESTING_POLICY.lookbackDays
  });
}
