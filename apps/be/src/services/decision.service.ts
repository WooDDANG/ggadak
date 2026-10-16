import {
  ActionItemState,
  createLogger,
  Decision,
  DecisionSchema,
  DecisionState,
  includesValue,
  RationaleStatus,
  ReviewAction,
  ReviewActionSchema,
  ReviewActionType,
  ReviewResolution,
  TaskDisposition,
} from '@ggaddak/shared';

import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';
import { randomUUID } from 'node:crypto';
import { DecisionEditSchema, type DecisionEditDto } from '../dto/decision-edit.dto.js';
import type { QueryDecisionsFilter } from '../dto/v1-decision.dto.js';
import { BadRequestError, ConflictError } from '../errors/AppError.js';
import { Service } from 'typedi';

import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-DECISION-SERVICE');

@Service()
export class DecisionService {
  constructor(private repo: DecisionRepository) {}

  async getHistory(id: string) {
    return new AnalysisRequestRepository(this.repo).history(id);
  }

  async editDecision(id: string, body: DecisionEditDto, actorId: string) {
    const parsed = DecisionEditSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestError('Invalid decision edit', parsed.error.flatten());
    const edit = parsed.data;
    const old = await this.repo.getDecisionById(id);
    if (!old) return null;
    if (old.version !== edit.expectedVersion) throw new ConflictError('Stale decision version');
    if (old.state === DecisionState.Superseded || old.state === DecisionState.Rejected)
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
      rationaleStatus: edit.rationale ? RationaleStatus.Stated : RationaleStatus.NotStated,
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
    const parsed = DecisionSchema.safeParse(decision);
    if (!parsed.success)
      throw new BadRequestError('Invalid decision payload', parsed.error.flatten());
    await this.repo.saveDecision(parsed.data);
  }

  async reviewDecision(
    decisionId: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'>,
  ): Promise<Decision | null> {
    const parsed = ReviewActionSchema.safeParse({ ...params, action });
    if (!parsed.success)
      throw new BadRequestError('Invalid versioned review', parsed.error.flatten());
    params = parsed.data;
    const updated = await this.repo.withTransaction(async tx => {
      const id = decisionId;
      const existing = await this.repo.getDecisionById(id, tx);
      if (!existing) return null;
      if (params.expectedVersion !== existing.version)
        throw new ConflictError('Stale candidate version');
      if (
        !includesValue(
          [
            DecisionState.Draft,
            DecisionState.Proposed,
            DecisionState.Discussing,
            DecisionState.Deferred,
          ],
          existing.state,
        )
      )
        throw new ConflictError('Decision is no longer reviewable');
      if (params.resolution === ReviewResolution.Replace && action !== ReviewActionType.Confirm)
        throw new BadRequestError('Replacement requires confirmation');
      const updated = { ...existing };
      if (action === ReviewActionType.Confirm || action === ReviewActionType.Edit) {
        for (const field of [
          'title',
          'decisionContent',
          'rationale',
          'rationaleSummary',
          'rationaleQuotes',
          'categoryTag',
        ] as const) {
          if (params[field] !== undefined) Object.assign(updated, { [field]: params[field] });
        }
      }
      if (action === ReviewActionType.Confirm) {
        updated.state = DecisionState.Decided;
        updated.approvedBy = params.approvedBy ?? 'Reviewer';
        updated.decisionConfirmedDate = new Date().toISOString();
      }
      if (action === ReviewActionType.Defer) updated.state = DecisionState.Deferred;
      if (action === ReviewActionType.Reject) updated.state = DecisionState.Rejected;
      // A saved suggestion is not a replacement link until explicitly approved.
      if (action === ReviewActionType.Confirm && params.resolution !== ReviewResolution.Replace)
        updated.supersedesId = null;
      let replacement: Decision | undefined;
      if (params.resolution === ReviewResolution.Replace) {
        if (!params.predecessorId || !params.predecessorVersion || params.predecessorId === id)
          throw new BadRequestError('A distinct predecessor and its version are required');
        const predecessor = await this.repo.getDecisionById(params.predecessorId, tx);
        if (!predecessor) throw new ConflictError('Predecessor no longer exists');
        if (
          predecessor.version !== params.predecessorVersion ||
          predecessor.state !== DecisionState.Decided ||
          predecessor.supersededById
        )
          throw new ConflictError('Stale or inactive predecessor');
        if (predecessor.source.guildId !== existing.source.guildId)
          throw new BadRequestError('Predecessor must belong to the same guild');
        const choices = new Map(
          (params.taskDispositions ?? []).map(choice => [choice.actionItemId, choice]),
        );
        if (
          choices.size !== (params.taskDispositions ?? []).length ||
          [...choices.keys()].some(key => !predecessor.actionItems.some(item => item.id === key))
        )
          throw new BadRequestError('Invalid or duplicate Action Item disposition');
        predecessor.actionItems = predecessor.actionItems.map(item => {
          const choice = item.id ? choices.get(item.id) : undefined;
          let state = item.state ?? ActionItemState.Unknown;
          if (state === ActionItemState.Unknown) {
            if (!choice?.classification)
              throw new BadRequestError('Classify unknown Action Item completion');
            state = choice.classification;
          } else if (choice?.classification && choice.classification !== state) {
            throw new BadRequestError('Only unknown Action Items require classification');
          }
          if (state !== ActionItemState.Open) {
            if (choice?.disposition)
              throw new BadRequestError('Only unfinished Action Items can be disposed');
            return { ...item, state };
          }
          if (!choice?.disposition)
            throw new BadRequestError('Every unfinished Action Item needs cancel or transfer');
          if (choice.disposition === TaskDisposition.Transfer) {
            updated.actionItems = [
              ...updated.actionItems,
              {
                ...item,
                id: randomUUID(),
                state: ActionItemState.Open,
                transferredFromDecisionId: predecessor.id,
                transferredFromActionItemId: item.id,
                transferredToDecisionId: undefined,
              },
            ];
            return { ...item, state: ActionItemState.Transferred, transferredToDecisionId: id };
          }
          return { ...item, state: ActionItemState.Canceled };
        });
        predecessor.state = DecisionState.Superseded;
        predecessor.supersededById = id;
        predecessor.version = params.predecessorVersion + 1;
        updated.supersedesId = predecessor.id;
        replacement = predecessor;
      }
      updated.version = (existing.version ?? 1) + 1;
      if (params.rationale !== undefined)
        updated.rationaleStatus = updated.rationale
          ? RationaleStatus.Stated
          : RationaleStatus.NotStated;
      if (
        replacement &&
        !(await this.repo.writeReviewedDecision(replacement, params.predecessorVersion!, tx, true))
      )
        throw new ConflictError('Predecessor was already replaced');
      if (!(await this.repo.writeReviewedDecision(updated, params.expectedVersion, tx)))
        throw new ConflictError('Stale candidate version');
      if (action === ReviewActionType.Reject && updated.evidenceHash)
        await this.repo.recordRejectedEvidence(updated.evidenceHash, tx);
      return this.repo.getDecisionById(id, tx);
    });
    if (updated) {
      logger.info(
        `[Review] Decision [${decisionId}] reviewed with action: ${action} -> state: ${updated.state}`,
      );
    }
    return updated;
  }
}
