import { randomUUID } from 'node:crypto';
import { DecisionEditSchema, type DecisionEditDto } from '../dto/decision-edit.dto.js';
import type { QueryDecisionsFilter } from '../dto/v1-decision.dto.js';
import { BadRequestError, ConflictError } from '../errors/AppError.js';
import { Service } from 'typedi';
import { Decision, ReviewAction, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-DECISION-SERVICE');

@Service()
export class DecisionService {
  constructor(private repo: DecisionRepository) {}

  async editDecision(id: string, body: DecisionEditDto, actorId: string) {
    const parsed = DecisionEditSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestError('Invalid decision edit', parsed.error.flatten());
    const edit = parsed.data;
    const old = await this.repo.getDecisionById(id);
    if (!old) return null;
    if (old.version !== edit.expectedVersion) throw new ConflictError('Stale decision version');
    if (old.state === 'Superseded' || old.state === 'Rejected')
      throw new ConflictError('Historical decisions cannot be edited');
    const ids = old.alternatives.map((item, index) => item.id ?? `${id}:alternative:${index}`);
    const supplied = edit.alternatives.flatMap(item => (item.id ? [item.id] : []));
    if (new Set(supplied).size !== supplied.length || supplied.some(value => !ids.includes(value)))
      throw new BadRequestError('Unknown or duplicate alternative ID');
    const updated: Decision = {
      ...old,
      title: edit.title,
      decision: edit.decision,
      decisionContent: edit.decision,
      rationale: edit.rationale,
      rationaleSummary: edit.rationale,
      categoryTag: edit.category,
      version: edit.expectedVersion + 1,
      alternatives: edit.alternatives.map(item => ({
        id: item.id ?? randomUUID(),
        option: item.name,
        reason: item.reason,
      })),
    };
    const saved = await this.repo.editDecision(updated, edit.expectedVersion, actorId);
    if (!saved) throw new ConflictError('Stale decision version');
    return saved;
  }

  async browseDecisions(filter: QueryDecisionsFilter) {
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
