import { z } from 'zod';
import { ActionItemSchema } from '@ggaddak/shared';

export const ExtractedDecisionItemSchema = z.object({
  topic: z.string().describe('The broad technical or organizational topic (e.g. Database Selection, Auth, Deployment)'),
  decision: z.string().describe('The concrete agreed decision or conclusion reached'),
  rationale: z.string().describe('The specific reasons, trade-offs, and discarded alternatives'),
  actionItems: z.array(ActionItemSchema).default([])
});

export const ExtractionResultSchema = z.object({
  found: z.boolean().describe('True if one or more valid decisions were mutually agreed upon, false otherwise'),
  summary: z.string().describe('Brief one-line summary of the analysis outcome'),
  decisions: z.array(ExtractedDecisionItemSchema).default([])
});

export type ExtractedDecisionItem = z.infer<typeof ExtractedDecisionItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
