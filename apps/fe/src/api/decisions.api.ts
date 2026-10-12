import { Decision, ReviewAction } from '@ggaddak/shared';
import { apiClient } from './client';
import { listV1Decisions } from './generated';

export interface GetDecisionsParams {
  topic?: string;
  state?: string;
  categoryTag?: string;
}

export const decisionsApi = {
  getDecisions: async (params: GetDecisionsParams = {}): Promise<Decision[]> => {
    const response = await listV1Decisions(params);
    if (response.status !== 200 || !response.data.success) {
      throw new Error(response.data.message || `HTTP ${response.status}`);
    }
    // The compatibility endpoint returns full shared Decision Records; the legacy
    // OpenAPI DTO marks their defaulted fields optional.
    return response.data.data.decisions as Decision[];
  },

  reviewDecision: async (id: string, action: ReviewAction): Promise<Decision> => {
    const data = await apiClient<{ status: string; decision: Decision }>(
      `/api/decisions/${id}/review`,
      {
        method: 'POST',
        body: JSON.stringify(action),
      },
    );
    return data.decision;
  },

  resolveConflict: async (
    decisionId: string,
    conflictingId: string,
    resolution: 'supersede' | 'coexist',
  ): Promise<void> => {
    await apiClient<{ status: string }>('/api/decisions/conflict', {
      method: 'POST',
      body: JSON.stringify({ decisionId, conflictingId, resolution }),
    });
  },
};
