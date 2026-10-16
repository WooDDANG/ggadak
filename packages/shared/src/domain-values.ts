/** Runtime enum objects keep wire values and string-literal types compatible. */

export const DecisionState = {
  Draft: 'Draft',
  Proposed: 'Proposed',
  Discussing: 'Discussing',
  Decided: 'Decided',
  Deferred: 'Deferred',
  Superseded: 'Superseded',
  Rejected: 'Rejected',
} as const;
export type DecisionState = (typeof DecisionState)[keyof typeof DecisionState];

export const CategoryTag = {
  Target: '타깃',
  Problem: '문제정의',
  Feature: '기능',
  Technology: '기술',
  BusinessModel: 'BM',
  Other: '기타',
} as const;
export type CategoryTag = (typeof CategoryTag)[keyof typeof CategoryTag];

export const FeedbackSourceType = {
  Professor: '교수',
  Judge: '심사위원',
  Teammate: '팀원',
  Interviewee: '인터뷰이',
} as const;
export type FeedbackSourceType = (typeof FeedbackSourceType)[keyof typeof FeedbackSourceType];

export const ActionItemState = {
  Unknown: 'unknown',
  Open: 'open',
  Completed: 'completed',
  Canceled: 'canceled',
  Transferred: 'transferred',
} as const;
export type ActionItemState = (typeof ActionItemState)[keyof typeof ActionItemState];

export const RationaleStatus = {
  Stated: 'stated',
  NotStated: 'not_stated',
} as const;
export type RationaleStatus = (typeof RationaleStatus)[keyof typeof RationaleStatus];

export const DecisionObservation = {
  Proposed: 'proposed',
  Agreed: 'agreed',
  Withdrawn: 'withdrawn',
  Unclear: 'unclear',
} as const;
export type DecisionObservation = (typeof DecisionObservation)[keyof typeof DecisionObservation];

export const ReviewActionType = {
  Confirm: 'confirm',
  Defer: 'defer',
  Reject: 'reject',
  Edit: 'edit',
} as const;
export type ReviewActionType = (typeof ReviewActionType)[keyof typeof ReviewActionType];

export const ReviewResolution = {
  Independent: 'independent',
  Replace: 'replace',
} as const;
export type ReviewResolution = (typeof ReviewResolution)[keyof typeof ReviewResolution];

export const TaskDisposition = {
  Cancel: 'cancel',
  Transfer: 'transfer',
} as const;
export type TaskDisposition = (typeof TaskDisposition)[keyof typeof TaskDisposition];

export const SyncJobStatus = {
  Queued: 'QUEUED',
  Processing: 'PROCESSING',
  Completed: 'COMPLETED',
  Failed: 'FAILED',
} as const;
export type SyncJobStatus = (typeof SyncJobStatus)[keyof typeof SyncJobStatus];

export const SyncChannelStatus = {
  Waiting: 'WAITING',
  Received: 'RECEIVED',
  Completed: 'COMPLETED',
  Failed: 'FAILED',
} as const;
export type SyncChannelStatus = (typeof SyncChannelStatus)[keyof typeof SyncChannelStatus];

export const DeliveryStatus = {
  Pending: 'pending',
  RetryPending: 'retry-pending',
  RetainedFailure: 'retained-failure',
  CompletedWithCandidates: 'completed-with-candidates',
  CompletedNoDecision: 'completed-no-decision',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const DeliveryErrorCategory = {
  ReceiveCapacity: 'receive-capacity',
  AnalysisInProgress: 'analysis-in-progress',
  AnalysisTerminal: 'analysis-terminal',
  ConfigurationOrPayload: 'configuration-or-payload',
  BackendUnavailable: 'backend-unavailable',
  InvalidResult: 'invalid-result',
  NetworkOrTimeout: 'network-or-timeout',
  AnalysisCapacity: 'analysis-capacity',
  ProviderOrStorage: 'provider-or-storage',
} as const;
export type DeliveryErrorCategory =
  (typeof DeliveryErrorCategory)[keyof typeof DeliveryErrorCategory];

export const GraphNodeType = {
  Topic: 'Topic',
  Issue: 'Issue',
  DecisionCandidate: 'DecisionCandidate',
  Alternative: 'Alternative',
  Rationale: 'Rationale',
  ActionItem: 'ActionItem',
} as const;
export type GraphNodeType = (typeof GraphNodeType)[keyof typeof GraphNodeType];

export const GraphEdgeType = {
  Contains: 'contains',
  HasAlternative: 'has_alternative',
  Supports: 'supports',
  Opposes: 'opposes',
  Triggers: 'triggers',
  ConflictsWith: 'conflicts_with',
  DependsOn: 'depends_on',
} as const;
export type GraphEdgeType = (typeof GraphEdgeType)[keyof typeof GraphEdgeType];

/** Accept stored strings without unsafe narrowing of enum-array includes calls. */
export function includesValue(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

export function parseSyncJobStatus(value: string): SyncJobStatus {
  const status = Object.values(SyncJobStatus).find(status => status === value);
  if (!status) throw new Error(`Unknown sync job status: ${value}`);
  return status;
}
