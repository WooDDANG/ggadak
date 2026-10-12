import { Decision, ReviewAction } from '@ggaddak/shared';
import { apiClient } from './client';
import { listV1Decisions, getV1Decision, getDecisionTimeline, listV1ReviewQueue, reviewV1Candidate, editV1Decision } from './generated';
import type { ListV1DecisionsParams, V1DecisionDto, DecisionEditDto, GetDecisionTimelineParams } from './generated/model';

export interface GetDecisionsParams {
  guildId: string;
  topic?: string;
  state?: string;
  categoryTag?: string;
}

function asDecision(item: V1DecisionDto): Decision {
  return {
    ...item,
    alternatives: item.alternatives.map(alt => ({ option: alt.name, reason: alt.reason })),
  } as unknown as Decision;
}

export const decisionsApi = {
  getReviewQueue: async (
    guildId: string,
    status: 'IN_REVIEW' | 'ON_HOLD' = 'IN_REVIEW',
  ): Promise<Decision[]> => {
    const items: Decision[] = [];
    let page = 1;
    while (true) {
      const response = await listV1ReviewQueue({ guildId, status, page, size: 100 });
      if (response.status !== 200 || !response.data.success)
        throw new Error(response.data.message || `HTTP ${response.status}`);
      items.push(...response.data.data.items.map(asDecision));
      if (page >= response.data.data.pageInfo.totalPages) return items;
      page++;
    }
  },
  edit: async (id: string, guildId: string, body: DecisionEditDto) => {
    const response = await editV1Decision(id, body, { guildId });
    if (response.status !== 200 || !response.data.success)
      throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;

  },
  browse: async (params: ListV1DecisionsParams) => {
    const response = await listV1Decisions(params);
    if (response.status !== 200 || !response.data.success)
      throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;
  },
  timeline: async (params: GetDecisionTimelineParams) => {
    const response = await getDecisionTimeline(params);
    if (response.status !== 200 || !response.data.success)
      throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;
  },
  detail: async (id: string, guildId: string) => {
    const response = await getV1Decision(id, { guildId });
    if (response.status !== 200 || !response.data.success)
      throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;
  },
  getDecisions: async (params: GetDecisionsParams): Promise<Decision[]> => {
    const first = await decisionsApi.browse({ ...params, size: 100 });
    const records = [...first.decisions];
    for (let page = 2; page <= first.pageInfo.totalPages; page++) {
      records.push(...(await decisionsApi.browse({ ...params, size: 100, page })).decisions);
    }
    return records as Decision[];
  },

  reviewDecision: async (id: string, action: ReviewAction, guildId: string): Promise<Decision> => {
    const { approvedBy: _approvedBy, action: reviewAction, ...params } = action;
    if (reviewAction === 'edit') throw new Error('Use the Decision Card editor');
    const request = { ...params, action: reviewAction };
    const response = await reviewV1Candidate(id, request, { guildId });
    if (response.status !== 200 || !response.data.success)
      throw new Error(response.data.message || `HTTP ${response.status}`);
    return asDecision(response.data.data);
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
