import { z } from 'zod';
import { ActionItem } from '@ggaddak/shared';

export const ExtractedDecisionSchema = z.object({
  found: z.boolean().describe('True if a clear consensus or decision was reached in the conversation, false otherwise.'),
  topic: z.string().describe('The broad topic or agenda being discussed (e.g. "Database Selection", "Auth Provider").'),
  decision: z.string().describe('The concrete agreement or conclusion reached by the participants.'),
  rationale: z.string().describe('The reasoning, trade-offs, and context that led to this decision.'),
  actionItems: z.array(
    z.object({
      task: z.string(),
      assignee: z.string().optional(),
      dueDate: z.string().optional()
    })
  ).default([])
});

export type ExtractedDecision = z.infer<typeof ExtractedDecisionSchema>;

export interface LLMProvider {
  generateStructuredDecision(transcript: string): Promise<ExtractedDecision>;
}

export class MockLLMProvider implements LLMProvider {
  async generateStructuredDecision(transcript: string): Promise<ExtractedDecision> {
    // Deterministic parser for testing and simulation
    if (transcript.includes('PostgreSQL') || transcript.includes('Postgres')) {
      return {
        found: true,
        topic: 'Database Selection',
        decision: 'Adopt PostgreSQL as the primary transactional database',
        rationale: 'Required strong ACID consistency and robust relational modeling',
        actionItems: [{ task: 'Provision PostgreSQL RDS instance', assignee: 'alex' }]
      };
    }

    if (transcript.includes('MongoDB')) {
      return {
        found: true,
        topic: 'Database Selection',
        decision: 'Adopt MongoDB for document and log storage',
        rationale: 'High throughput for unstructured log entries and flexible schemas',
        actionItems: [{ task: 'Setup MongoDB cluster', assignee: 'wooddang' }]
      };
    }

    return {
      found: true,
      topic: 'General Agreement',
      decision: 'Extracted decision from discussion',
      rationale: 'Team converged on common consensus in chat',
      actionItems: []
    };
  }
}

export class DecisionExtractor {
  constructor(private llm: LLMProvider = new MockLLMProvider()) {}

  async extract(transcript: string): Promise<ExtractedDecision | null> {
    if (!transcript || transcript.trim().length === 0) {
      return null;
    }
    const result = await this.llm.generateStructuredDecision(transcript);
    if (!result.found) {
      return null;
    }
    return result;
  }
}
