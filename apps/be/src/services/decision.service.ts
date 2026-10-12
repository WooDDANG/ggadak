import { Service } from 'typedi';
import { Decision, ReviewAction, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-DECISION-SERVICE');

@Service()
export class DecisionService {
  constructor(private repo: DecisionRepository) {}

  async editDecision(
    id: string,
    body: import('../dto/decision-edit.dto.js').DecisionEditDto,
    actorId: string,
  ) {
    return this.repo.editDecision(id, body, actorId);
  }

  async browseDecisions(filter: Parameters<DecisionRepository['browseDecisions']>[0]) {
    return this.repo.browseDecisions(filter);
  }

  async getConfirmedTimeline(filter: Parameters<DecisionRepository['getConfirmedTimeline']>[0]) {
    return this.repo.getConfirmedTimeline(filter);
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
}
