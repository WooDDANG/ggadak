export interface HarvestingPolicyDto {
  initialScanLimit: number;
  contextWindowBefore: number;
  contextWindowAfter: number;
  maxMergedWindow: number;
  reactionThreshold: number;
  debounceMs: number;
  agreementThreshold: number;
  lookbackDays: number;
}
