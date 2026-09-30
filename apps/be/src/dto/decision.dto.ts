import { z } from 'zod';
import { CategoryTagSchema, ReviewActionSchema, DecisionPayloadSchema, Decision } from '@ggaddak/shared';

export const QueryDecisionsDtoSchema = z.object({
  topic: z.string().optional(),
  state: z.string().optional(),
  categoryTag: CategoryTagSchema.optional(),
});

export type QueryDecisionsDto = z.infer<typeof QueryDecisionsDtoSchema>;

export const ReviewDecisionDtoSchema = ReviewActionSchema;
export type ReviewDecisionDto = z.infer<typeof ReviewDecisionDtoSchema>;

export const ResolveConflictDtoSchema = z.object({
  decisionId: z.string(),
  conflictingId: z.string(),
  resolution: z.enum(['supersede', 'coexist']),
});
export type ResolveConflictDto = z.infer<typeof ResolveConflictDtoSchema>;

export const DecisionWebhookDtoSchema = DecisionPayloadSchema;
export type DecisionWebhookDto = z.infer<typeof DecisionWebhookDtoSchema>;

export interface DecisionListResponseDto {
  decisions: Decision[];
}

export interface ReviewDecisionResponseDto {
  status: 'ok';
  decision: Decision;
}
