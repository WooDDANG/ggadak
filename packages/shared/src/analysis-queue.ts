/** Durable input receipt lifecycle shared by the backend and bot. */
export enum AnalysisReceiptState {
  Receiving = 'receiving',
  Pending = 'pending',
  Processing = 'processing',
  Retry = 'retry',
  Completed = 'completed',
  Failed = 'failed',
}

/** A scan becomes eligible for analysis only after its manifest is sealed. */
export enum AnalysisScanState {
  Receiving = 'receiving',
  CapacityExceeded = 'capacity-exceeded',
  Sealed = 'sealed',
}

export function parseReceiptState(value: string): AnalysisReceiptState {
  const state = Object.values(AnalysisReceiptState).find(state => state === value);
  if (!state) throw new Error(`Unknown analysis receipt state: ${value}`);
  return state;
}

export function parseScanState(value: string): AnalysisScanState {
  const state = Object.values(AnalysisScanState).find(state => state === value);
  if (!state) throw new Error(`Unknown analysis scan state: ${value}`);
  return state;
}
