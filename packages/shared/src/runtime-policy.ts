/** Units used when declaring durations and storage budgets. */
export const DurationMs = {
  Second: 1_000,
  Minute: 60_000,
  Hour: 3_600_000,
  Day: 86_400_000,
} as const;
export const StorageBytes = { KiB: 1_024, MiB: 1_048_576 } as const;

export const ServiceDefaults = {
  backendUrl: 'http://localhost:3001',
  webUrl: 'http://localhost:3002',
  backendPort: 3001,
} as const;

/** Shared timing contracts: Bot heartbeat must remain shorter than BE freshness. */
export const DeliveryPolicy = {
  statusHeartbeatMs: 5 * DurationMs.Second,
  statusFreshnessMs: 15 * DurationMs.Second,
  serviceTimeoutMs: 15 * DurationMs.Second,
  retentionMs: 7 * DurationMs.Day,
  maxBatchSize: 100,
  cleanupBatchSize: 50,
  historyPageSize: 500,
  maintenanceIntervalMs: DurationMs.Minute,
  maxAttempts: 5,
  initialRetryMs: 5 * DurationMs.Second,
  maxRetryMs: 5 * DurationMs.Minute,
  analysisTimeoutMs: 190 * DurationMs.Second,
  retryJitter: 0.2,
  failedResultPollMs: 30 * DurationMs.Second,
  maxRetryAfterMs: DurationMs.Day,
  journalBytes: 256 * StorageBytes.MiB,
  scanBytes: 64 * StorageBytes.MiB,
  minFreeBytes: 64 * StorageBytes.MiB,
  dataBudgetRatio: 0.9,
} as const;

export const AnalysisPolicy = {
  leaseMs: DurationMs.Minute,
  leaseHeartbeatMs: 20 * DurationMs.Second,
  workerIntervalMs: 500,
  concurrency: 1,
  maxConcurrency: 32,
  foregroundBurst: 5,
  maxMessages: 100,
  maxRequestBytes: 256 * StorageBytes.KiB,
  maxBytes: 256 * StorageBytes.MiB,
  maxChannelBytes: 64 * StorageBytes.MiB,
  maxPending: 2_000,
} as const;

export const SyncJobPolicy = {
  leaseMs: 2 * DurationMs.Minute,
  heartbeatMs: 30 * DurationMs.Second,
  pollIntervalMs: 5 * DurationMs.Second,
} as const;

export const DiscordHistoryPolicy = { pageSize: 100, uploadChunkBytes: 180_000 } as const;

/** Read lazily so tests and process startup can supply an explicit environment. */
export function positiveIntegerSetting(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}

export function asyncDeliveryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.ANALYSIS_ASYNC_DELIVERY !== 'false' && env.NODE_ENV !== 'test';
}
