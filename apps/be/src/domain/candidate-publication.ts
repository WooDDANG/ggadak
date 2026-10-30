import type { Decision } from '@ggaddak/shared';

export interface CandidateDraft {
  decision: Decision;
  evidenceJson: string;
  legacyHash: string;
  graphNodeId?: string;
}
export interface CandidateHistoryEntry {
  requestId: string;
  isManualOverride: boolean;
  previousRequestIds: string[];
  relatedCandidateIds: string[];
  createdAt: string;
  graphAvailable?: boolean;
  candidateNodeIds?: string[];
}
