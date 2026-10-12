import { Decision, ReviewAction } from '@ggaddak/shared';
import { listV1Decisions, getV1Decision, getDecisionTimeline, listV1ReviewQueue, reviewV1Candidate, editV1Decision } from './generated';
import type { ListV1DecisionsParams, V1DecisionDto, DecisionEditDto, GetDecisionTimelineParams } from './generated/model';
import { unwrapApiResponse } from './api-response';

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
      const data = unwrapApiResponse(response);
      items.push(...data.items.map(asDecision));
      if (page >= data.pageInfo.totalPages) return items;
      page++;
    }
  },
  edit: async (id: string, guildId: string, body: DecisionEditDto) => {
    const response = await editV1Decision(id, body, { guildId });
    return unwrapApiResponse(response);

  },
  browse: async (params: ListV1DecisionsParams) => {
    const response = await listV1Decisions(params);
    return unwrapApiResponse(response);
  },
  timeline: async (params: GetDecisionTimelineParams) => {
    const response = await getDecisionTimeline(params);
    return unwrapApiResponse(response);
  },
  detail: async (id: string, guildId: string) => {
    const response = await getV1Decision(id, { guildId });
    return unwrapApiResponse(response);
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
    return asDecision(unwrapApiResponse(response));
  },

};
