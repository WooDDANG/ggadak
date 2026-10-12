import { Service } from 'typedi';
import { Decision, ReviewAction, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-DECISION-SERVICE');

export interface QueryDecisionsFilter {
  guildId?: string;
  topic?: string;
  state?: string;
  categoryTag?: string;
}

@Service()
export class DecisionService {
  constructor(private repo: DecisionRepository) {}

  async browseDecisions(filter: Parameters<DecisionRepository['browseDecisions']>[0]) {
    return this.repo.browseDecisions(filter);
  }

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
    body: import('../dto/decision.dto.js').ResolveConflictDto,
  ): Promise<boolean> {
    const updated = await this.repo.reviewDecision(body.decisionId, 'confirm', {
      expectedVersion: body.expectedVersion,
      resolution: body.resolution === 'supersede' ? 'replace' : 'independent',
      predecessorId: body.conflictingId,
      predecessorVersion: body.predecessorVersion,
      taskDispositions: body.taskDispositions,
    });
    if (!updated)
      throw new (await import('../errors/AppError.js')).NotFoundError('Decision not found');
    return true;
  }
}
