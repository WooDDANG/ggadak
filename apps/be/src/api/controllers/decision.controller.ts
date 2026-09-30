import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@ggaddak/shared';
import { DecisionService } from '../../services/decision.service.js';
import {
  QueryDecisionsDtoSchema,
  ReviewDecisionDtoSchema,
  ResolveConflictDtoSchema,
  DecisionWebhookDtoSchema,
} from '../../dto/decision.dto.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';

const logger = createLogger('DECISION-CONTROLLER');

export class DecisionController {
  constructor(private service: DecisionService) {}

  getDecisions = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = QueryDecisionsDtoSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }
      const decisions = this.service.getDecisions(parsed.data);
      res.status(200).json({ decisions });
    } catch (err) {
      next(err);
    }
  };

  reviewDecision = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const decisionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsed = ReviewDecisionDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid ReviewAction', parsed.error.issues);
      }

      const { action, approvedBy, title, decisionContent, rationale, categoryTag } = parsed.data;
      const updated = this.service.reviewDecision(decisionId, action, {
        approvedBy,
        title,
        decisionContent,
        rationale,
        categoryTag,
      });

      if (!updated) {
        throw new NotFoundError(`Decision [${decisionId}] not found`);
      }

      res.status(200).json({ status: 'ok', decision: updated });
    } catch (err) {
      next(err);
    }
  };

  resolveConflict = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = ResolveConflictDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid conflict resolution payload', parsed.error.issues);
      }
      const { decisionId, conflictingId, resolution } = parsed.data;
      this.service.resolveConflict(decisionId, conflictingId, resolution);
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  };

  ingestWebhook = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = DecisionWebhookDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn(`[Webhook] Rejected malformed payload: ${JSON.stringify(parsed.error.issues)}`);
        throw new BadRequestError('Invalid DecisionPayload', parsed.error.issues);
      }

      const decision = parsed.data.payload;
      this.service.saveDecision(decision);

      logger.info(`[Webhook] Successfully saved decision [${decision.id}] Topic="${decision.topic}"`);
      res.status(201).json({ status: 'ok', id: decision.id });
    } catch (err) {
      next(err);
    }
  };
}
