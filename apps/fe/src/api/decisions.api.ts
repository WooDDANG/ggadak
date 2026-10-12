import { Decision, ReviewAction } from '@ggaddak/shared';
import { apiClient } from './client';
import { listV1Decisions, getV1Decision } from './generated';
import type { ListV1DecisionsParams } from './generated/model';

export interface GetDecisionsParams {
  guildId: string;
  topic?: string;
  state?: string;
  categoryTag?: string;
}

export const decisionsApi = {
  browse: async (params: ListV1DecisionsParams) => {
    const response = await listV1Decisions(params);
    if (response.status !== 200 || !response.data.success) throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;
  },
  detail: async (id: string, guildId: string) => {
    const response = await getV1Decision(id, {guildId});
    if (response.status !== 200 || !response.data.success) throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;
  },
  getDecisions: async (params: GetDecisionsParams): Promise<Decision[]> => {
    const first = await decisionsApi.browse({...params, size: 100});
    const records = [...first.decisions];
    for (let page = 2; page <= first.pageInfo.totalPages; page++) {
      records.push(...(await decisionsApi.browse({...params, size: 100, page})).decisions);
    }
    return records as Decision[];
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
