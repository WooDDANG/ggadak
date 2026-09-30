import { Decision, ReviewAction, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../db.js';

const logger = createLogger('BE-DECISION-SERVICE');

export interface QueryDecisionsFilter {
  topic?: string;
  state?: string;
  categoryTag?: string;
}

export class DecisionService {
  constructor(private repo: DecisionRepository) {}

  getDecisions(filter: QueryDecisionsFilter): Decision[] {
    return this.repo.getDecisions(filter);
  }

  getDecisionById(id: string): Decision | null {
    return this.repo.getDecisionById(id);
  }

  saveDecision(decision: Decision): void {
    this.repo.saveDecision(decision);
  }

  reviewDecision(
    decisionId: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'>,
  ): Decision | null {
    const updated = this.repo.reviewDecision(decisionId, action, params);
    if (updated) {
      logger.info(
        `[Review] Decision [${decisionId}] reviewed with action: ${action} -> state: ${updated.state}`,
      );
    }
    return updated;
  }

  resolveConflict(decisionId: string, conflictingId: string, resolution: string): boolean {
    if (resolution === 'supersede' && conflictingId && decisionId) {
      const current = this.repo.getDecisionById(decisionId);
      if (current) {
        current.supersedesId = conflictingId;
        current.state = 'Decided';
        this.repo.saveDecision(current);
        logger.info(`[Conflict] Decision [${decisionId}] now supersedes [${conflictingId}]`);
        return true;
      }
    }
    return false;
  }
}
