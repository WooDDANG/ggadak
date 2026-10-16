/** Browser polling policies; these are build-time product defaults, never secrets. */
export const QueryPolicy = {
  staleTimeMs: 2_000,
  activityPollMs: 5_000,
  dashboardPollMs: 2_000,
  syncJobPollMs: 1_500,
  retryCommandPollMs: 2_000,
} as const;
