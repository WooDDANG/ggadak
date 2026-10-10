import { z } from 'zod';
import { CategoryTagSchema, ReviewActionSchema, DecisionPayloadSchema } from '@ggaddak/shared';

export interface AlternativeItemDto {
  option: string;
  reason: string;
}

export interface ActionItemDto {
  id?: string;
  state?: 'unknown' | 'open' | 'completed' | 'canceled' | 'transferred';
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
  rationaleSummary?: string;
  rationaleQuotes?: string[];
  alternatives?: AlternativeItemDto[];
  categoryTag?: '타깃' | '문제정의' | '기능' | '기술' | 'BM' | '기타';
  actionItems?: ActionItemDto[];
  state: 'Draft' | 'Proposed' | 'Discussing' | 'Decided' | 'Superseded' | 'Deferred' | 'Rejected';
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
  action: 'confirm' | 'defer' | 'reject' | 'edit';
  expectedVersion: number;
  resolution?: 'independent' | 'replace';
  predecessorId?: string;
  predecessorVersion?: number;
  taskDispositions?: {
    actionItemId: string;
    classification?: 'open' | 'completed';
    disposition?: 'cancel' | 'transfer';
  }[];
  rationaleSummary?: string;
  rationaleQuotes?: string[];
  approvedBy?: string;
  title?: string;
  decisionContent?: string;
  rationale?: string;
  categoryTag?: '타깃' | '문제정의' | '기능' | '기술' | 'BM' | '기타';
}

export const ResolveConflictDtoSchema = z.object({
  decisionId: z.string(),
  conflictingId: z.string(),
  resolution: z.enum(['supersede', 'coexist']),
  expectedVersion: z.number().int().positive(),
  predecessorVersion: z.number().int().positive().optional(),
  taskDispositions: ReviewActionSchema.shape.taskDispositions,
});

export interface ResolveConflictDto {
  decisionId: string;
  conflictingId: string;
  resolution: 'supersede' | 'coexist';
  expectedVersion: number;
  predecessorVersion?: number;
  taskDispositions?: ReviewDecisionDto['taskDispositions'];
}

export const DecisionWebhookDtoSchema = DecisionPayloadSchema;

export interface DecisionWebhookDto {
  event: string;
  payload: any;
}

export interface DecisionListResponseDto {
  decisions: DecisionItemDto[];
}

export interface ReviewDecisionResponseDto {
  status: 'ok';
  decision: DecisionItemDto;
}
