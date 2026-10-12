import type { Decision } from '@ggaddak/shared';
import type { V1DecisionDto } from './v1-decision.dto.js';

export type DecisionTimelineGroupBy = 'month' | 'topic' | 'channel' | 'category';
export interface DecisionTimelineDto {
  groupBy: DecisionTimelineGroupBy;
  timezone: string;
  totalElements: number;
  groups: { key: string; count: number; items: V1DecisionDto[] }[];
}

export function toDecisionTimeline(
  result: {
    groupBy: DecisionTimelineGroupBy;
    timezone: string;
    totalElements: number;
    groups: { key: string; count: number; items: Decision[] }[];
  },
  convert: (decision: Decision) => V1DecisionDto,
): DecisionTimelineDto {
  return {
    ...result,
    groups: result.groups.map(group => ({ ...group, items: group.items.map(convert) })),
  };
}
