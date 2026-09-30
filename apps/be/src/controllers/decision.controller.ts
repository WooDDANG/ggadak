import { IncomingMessage, ServerResponse } from 'node:http';
import { DecisionPayloadSchema, ReviewActionSchema, createLogger } from '@ggaddak/shared';
import { DecisionService } from '../services/decision.service.js';

const logger = createLogger('BE-DECISION-CONTROLLER');

export class DecisionController {
  constructor(private service: DecisionService) {}

  getDecisions(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const topic = url.searchParams.get('topic') || undefined;
    const state = url.searchParams.get('state') || undefined;
    const categoryTag = url.searchParams.get('categoryTag') || undefined;

    const decisions = this.service.getDecisions({ topic, state, categoryTag });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ decisions }));
  }

  reviewDecision(req: IncomingMessage, res: ServerResponse, decisionId: string): void {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const raw = JSON.parse(body);
        const parsed = ReviewActionSchema.safeParse(raw);
        if (!parsed.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid ReviewAction', details: parsed.error.issues }));
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
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Decision not found' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', decision: updated }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  resolveConflict(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { decisionId, conflictingId, resolution } = JSON.parse(body);
        this.service.resolveConflict(decisionId, conflictingId, resolution);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  ingestWebhook(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const raw = JSON.parse(body);
        const parsed = DecisionPayloadSchema.safeParse(raw);

        if (!parsed.success) {
          logger.warn(
            `[Webhook] Rejected malformed payload: ${JSON.stringify(parsed.error.issues)}`,
          );
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Invalid DecisionPayload', details: parsed.error.issues }),
          );
          return;
        }

        const decision = parsed.data.payload;
        this.service.saveDecision(decision);

        logger.info(
          `[Webhook] Successfully saved decision [${decision.id}] Topic="${decision.topic}"`,
        );
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', id: decision.id }));
      } catch (err: any) {
        logger.error(`[Webhook] Error parsing JSON body: ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
      }
    });
  }
}
