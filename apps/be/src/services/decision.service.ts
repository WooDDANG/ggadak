import { Service } from 'typedi';
import { Decision, ReviewAction, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-DECISION-SERVICE');

export interface QueryDecisionsFilter {
  topic?: string;
  state?: string;
  categoryTag?: string;
}

@Service()
export class DecisionService {
  constructor(private repo: DecisionRepository) {}

  async getDecisions(filter: QueryDecisionsFilter): Promise<Decision[]> {
    return this.repo.getDecisions(filter);
  }

  async getDecisionById(id: string): Promise<Decision | null> {
    return this.repo.getDecisionById(id);
  }

  async saveDecision(decision: Decision): Promise<void> {
    await this.repo.saveDecision(decision);
  }

  async reviewDecision(
    decisionId: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'>,
  ): Promise<Decision | null> {
    const updated = await this.repo.reviewDecision(decisionId, action, params);
    if (updated) {
      logger.info(
        `[Review] Decision [${decisionId}] reviewed with action: ${action} -> state: ${updated.state}`,
      );
    }
    return updated;
  }

  async resolveConflict(
    decisionId: string,
    conflictingId: string,
    resolution: string,
  ): Promise<boolean> {
    if (resolution === 'supersede' && conflictingId && decisionId) {
      const current = await this.repo.getDecisionById(decisionId);
      if (current) {
        current.supersedesId = conflictingId;
        current.state = 'Decided';
        await this.repo.saveDecision(current);
        logger.info(`[Conflict] Decision [${decisionId}] now supersedes [${conflictingId}]`);
        return true;
      }
    }
    return false;
  }
}
