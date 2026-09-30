import { Decision, ReviewAction } from '@ggaddak/shared';
import { apiClient } from './client';

export interface GetDecisionsParams {
  topic?: string;
  state?: string;
  categoryTag?: string;
}

export const decisionsApi = {
  getDecisions: async (params: GetDecisionsParams = {}): Promise<Decision[]> => {
    const query = new URLSearchParams();
    if (params.topic) query.set('topic', params.topic);
    if (params.state) query.set('state', params.state);
    if (params.categoryTag) query.set('categoryTag', params.categoryTag);

    const queryString = query.toString();
    const endpoint = `/api/decisions${queryString ? `?${queryString}` : ''}`;
    const data = await apiClient<{ decisions: Decision[] }>(endpoint);
    return data.decisions;
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
