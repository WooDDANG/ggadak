import { type Decision, DecisionState } from '@ggaddak/shared';

import type { DecisionItemDto } from './decision.dto.js';
export type DecisionStatus = 'IN_REVIEW' | 'CONFIRMED' | 'ON_HOLD' | 'DISCARDED' | 'SUPERSEDED';
export interface V1DecisionDto extends Omit<DecisionItemDto, 'alternatives'> {
  updatedAt?: string;
  status: DecisionStatus;
  category: string;
  confirmedDate: string | null;
  dates: { createdDate: string; confirmedDate: string | null; feedbackDate: string | null };
  alternatives: { id: string; name: string; reason: string }[];
}
export interface V1DecisionListDto {
  items: V1DecisionDto[];
  /** Compatibility projection for callers awaiting their feature migration. */
  decisions: DecisionItemDto[];
  pageInfo: { currentPage: number; pageSize: number; totalElements: number; totalPages: number };
}
export function toV1Decision(decision: Decision): V1DecisionDto {
  const status: DecisionStatus =
    decision.state === DecisionState.Decided
      ? 'CONFIRMED'
      : decision.state === DecisionState.Superseded
        ? 'SUPERSEDED'
        : decision.state === DecisionState.Deferred
          ? 'ON_HOLD'
          : decision.state === DecisionState.Rejected
            ? 'DISCARDED'
            : 'IN_REVIEW';
  return {
    ...decision,
    status,
    category: decision.categoryTag,
    confirmedDate: decision.decisionConfirmedDate ?? null,
    dates: {
      createdDate: decision.createdAt,
      confirmedDate: decision.decisionConfirmedDate ?? null,
      feedbackDate: decision.feedbackReceivedDate ?? null,
    },
    alternatives: decision.alternatives.map((item, index) => ({
      id: item.id ?? `${decision.id}:alternative:${index}`,
      name: item.option,
      reason: item.reason,
    })),
  };
}

export interface QueryDecisionsFilter {
  guildId: string;
  status?: string;
  category?: string;
  topic?: string;
  page: number;
  size: number;
}
