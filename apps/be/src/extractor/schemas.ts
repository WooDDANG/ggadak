import { z } from 'zod';
import { ActionItemSchema, AlternativeOptionSchema, CategoryTagSchema } from '@ggaddak/shared';

export const ExtractedDecisionItemSchema = z.object({
  topic: z.string().describe('The broad technical or organizational topic (e.g. Database Selection, Auth, Deployment, Target Definition)'),
  title: z.string().optional().describe('Concise one-line summary of the decision (e.g. 메인 DB로 PostgreSQL 채택)'),
  decision: z.string().describe('The concrete agreed decision details'),
  decisionContent: z.string().optional().describe('Full decision content grounded strictly in the transcript'),
  rationale: z.string().describe('The specific reasons and context explicitly stated in the transcript. Do NOT invent rationale not in the text.'),
  alternatives: z.array(AlternativeOptionSchema).default([]).describe('Examined alternatives and their reasons for being discarded'),
  categoryTag: CategoryTagSchema.default('기타').describe('Primary category: 타깃 | 문제정의 | 기능 | 기술 | BM | 기타'),
  actionItems: z.array(ActionItemSchema).default([]),
  isPivot: z.boolean().default(false).describe('True if this changes or supersedes a previously agreed direction')
});

export const ExtractionResultSchema = z.object({
  found: z.boolean().describe('True if one or more valid decisions were mutually agreed upon, false otherwise'),
  summary: z.string().describe('Brief one-line summary of the analysis outcome'),
  decisions: z.array(ExtractedDecisionItemSchema).default([])
});

export type ExtractedDecisionItem = z.infer<typeof ExtractedDecisionItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
