import { z } from 'zod';
export interface DecisionEditDto {
  /** Additional fields are rejected by edit validation; lifecycle is controlled by review. */
  [key: string]: unknown;
  /** Version last read; stale edits return 409. */
  expectedVersion: number;
  /** Required summary, 1–200 trimmed characters. */
  title: string;
  /** Required decision content, 1–10000 trimmed characters. */
  decision: string;
  /** Required Rationale, 1–10000 trimmed characters. */
  rationale: string;
  category: '타깃' | '문제정의' | '기능' | '기술' | 'BM' | '기타';
  /** Full replacement (max 20). Keep existing IDs, omit ID to add; omitted existing alternatives are deleted. Unknown/duplicate IDs rejected. */
  alternatives: { id?: string; name: string; reason: string }[];
}
export const DecisionEditSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    decision: z.string().trim().min(1).max(10000),
    rationale: z.string().trim().max(10000),
    category: z.enum(['타깃', '문제정의', '기능', '기술', 'BM', '기타']),
    alternatives: z
      .array(
        z
          .object({
            id: z.string().min(1).optional(),
            name: z.string().trim().min(1).max(200),
            reason: z.string().trim().max(2000),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
