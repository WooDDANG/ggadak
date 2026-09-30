import { z } from 'zod';
import { ActionItemSchema, AlternativeOptionSchema, CategoryTagSchema } from '@ggaddak/shared';

export const ExtractedDecisionItemSchema = z.object({
  topic: z
    .string()
    .describe(
      'The broad technical or organizational topic (e.g. Database Selection, Auth, Deployment, Target Definition)',
    ),
  title: z
    .string()
    .optional()
    .describe('Concise one-line summary of the decision (e.g. 메인 DB로 PostgreSQL 채택)'),
  decision: z.string().describe('The concrete agreed decision details'),
  decisionContent: z
    .string()
    .optional()
    .describe('Full decision content grounded strictly in the transcript'),
  rationale: z
    .string()
    .describe(
      'The specific reasons and context explicitly stated in the transcript. Do NOT invent rationale not in the text.',
    ),
  rationaleSummary: z
    .string()
    .optional()
    .describe('Concise one or two sentence summary of the primary reason/rationale for this decision (e.g. 트랜잭션 무결성 확보 및 빠른 개발 속도)'),
  rationaleQuotes: z
    .array(z.string())
    .default([])
    .describe('Relevant verbatim quote snippets from participants in the transcript directly justifying this decision (e.g. ["Alex: 구글까지 넣으면 일정이 너무 빠듯할 것 같아요.", "Wooddang: 그러면 MVP에서는 구글은 빼고 카카오만 먼저 하죠."])'),
  alternatives: z
    .array(AlternativeOptionSchema)
    .default([])
    .describe('Examined alternatives and their reasons for being discarded'),
  categoryTag: CategoryTagSchema.default('기타').describe(
    'Primary category: 타깃 | 문제정의 | 기능 | 기술 | BM | 기타',
  ),
  actionItems: z.array(ActionItemSchema).default([]),
  isPivot: z
    .boolean()
    .default(false)
    .describe('True if this changes or supersedes a previously agreed direction'),
});

export const ExtractionResultSchema = z.object({
  found: z
    .boolean()
    .describe('True if one or more valid decisions were mutually agreed upon, false otherwise'),
  summary: z.string().describe('Brief one-line summary of the analysis outcome'),
  decisions: z.array(ExtractedDecisionItemSchema).default([]),
});

export type ExtractedDecisionItem = z.infer<typeof ExtractedDecisionItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
