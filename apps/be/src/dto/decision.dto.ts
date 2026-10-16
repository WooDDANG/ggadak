import {
  type ActionItemState,
  type CategoryTag,
  CategoryTagSchema,
  type DecisionObservation,
  type DecisionState,
  type RationaleStatus,
  ReviewActionSchema,
  type ReviewActionType,
  type ReviewResolution,
  type TaskDisposition,
} from '@ggaddak/shared';
import { z } from 'zod';

export interface AlternativeItemDto {
  option: string;
  reason: string;
}

export interface ActionItemDto {
  id?: string;
  state?: ActionItemState;
  transferredFromDecisionId?: string;
  transferredFromActionItemId?: string;
  transferredToDecisionId?: string;
  task: string;
  assignee?: string;
  dueDate?: string;
}

export interface DecisionItemDto {
  id: string;
  version?: number;
  supersededById?: string | null;
  topic: string;
  decision: string;
  title?: string;
  decisionContent?: string;
  rationale: string;
  rationaleStatus?: RationaleStatus;
  observation?: DecisionObservation;
  rationaleSummary?: string;
  rationaleQuotes?: string[];
  alternatives?: AlternativeItemDto[];
  categoryTag?: CategoryTag;
  actionItems?: ActionItemDto[];
  state: DecisionState;
  supersedesId?: string | null;
  isPivot?: boolean | null;
  approvedBy?: string | null;
  decisionConfirmedDate?: string | null;
  feedbackSourceType?: string | null;
  feedbackSourceDetail?: string | null;
  feedbackReceivedDate?: string | null;
  rawEvidence?: string[];
  evidenceHash?: string | null;
  rawTranscript?: string | null;
  source?: Record<string, any>;
  messageCreatedAt?: string | null;
  createdAt: string;
  governanceScore?: number;
  governanceReason?: string;
  governancePassed?: boolean;
}

export const QueryDecisionsDtoSchema = z.object({
  topic: z.string().optional(),
  state: z.string().optional(),
  categoryTag: CategoryTagSchema.optional(),
});

export type QueryDecisionsDto = z.infer<typeof QueryDecisionsDtoSchema>;

export const ReviewDecisionDtoSchema = ReviewActionSchema;

export interface ReviewDecisionDto {
  action: ReviewActionType;
  expectedVersion: number;
  resolution?: ReviewResolution;
  predecessorId?: string;
  predecessorVersion?: number;
  taskDispositions?: {
    actionItemId: string;
    classification?: 'open' | 'completed';
    disposition?: TaskDisposition;
  }[];
  rationaleSummary?: string;
  rationaleQuotes?: string[];
  approvedBy?: string;
  title?: string;
  decisionContent?: string;
  rationale?: string;
  categoryTag?: CategoryTag;
}

export interface DecisionListResponseDto {
  decisions: DecisionItemDto[];
}

export interface ReviewDecisionResponseDto {
  status: 'ok';
  decision: DecisionItemDto;
}
