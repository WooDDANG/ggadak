import { Request, Response } from 'express';
import { DecisionPayloadSchema, ReviewActionSchema, createLogger } from '@ggaddak/shared';
import { DecisionService } from '../services/decision.service.js';

const logger = createLogger('BE-DECISION-CONTROLLER');

export class DecisionController {
  constructor(private service: DecisionService) {}

  getDecisions = (req: Request, res: Response): void => {
    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const categoryTag =
      typeof req.query.categoryTag === 'string' ? req.query.categoryTag : undefined;

    const decisions = this.service.getDecisions({ topic, state, categoryTag });
    res.status(200).json({ decisions });
  };

  reviewDecision = (req: Request, res: Response): void => {
    const decisionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsed = ReviewActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ReviewAction', details: parsed.error.issues });
      return;
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
      res.status(404).json({ error: 'Decision not found' });
      return;
    }

    res.status(200).json({ status: 'ok', decision: updated });
  };

  resolveConflict = (req: Request, res: Response): void => {
    const { decisionId, conflictingId, resolution } = req.body || {};
    this.service.resolveConflict(decisionId, conflictingId, resolution);
    res.status(200).json({ status: 'ok' });
  };

  ingestWebhook = (req: Request, res: Response): void => {
    const parsed = DecisionPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn(`[Webhook] Rejected malformed payload: ${JSON.stringify(parsed.error.issues)}`);
      res.status(400).json({ error: 'Invalid DecisionPayload', details: parsed.error.issues });
      return;
    }

    const decision = parsed.data.payload;
    this.service.saveDecision(decision);

    logger.info(`[Webhook] Successfully saved decision [${decision.id}] Topic="${decision.topic}"`);
    res.status(201).json({ status: 'ok', id: decision.id });
  };
}
