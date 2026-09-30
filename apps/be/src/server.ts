import http from 'node:http';
import crypto from 'node:crypto';
import morgan from 'morgan';
import {
  DecisionPayloadSchema,
  Decision,
  createLogger,
  getHarvestingPolicyFromEnv,
  ExternalFeedbackSchema,
  ReviewActionSchema
} from '@ggaddak/shared';
import { DecisionRepository } from './db.js';
import { BackendExtractionEngine } from './extractor/engine.js';

export function createServer(repo: DecisionRepository, extractor = new BackendExtractionEngine()) {
  const logger = createLogger('BE');

  // Morgan HTTP logging middleware
  const morganMiddleware = morgan('":method :url" :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message: string) => logger.info(`[HTTP] ${message.trim()}`)
    }
  });

  return http.createServer((req, res) => {
    morganMiddleware(req, res, async () => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
        return;
      }

      // 0. Centralized Policy Configuration API: GET /api/config/policy
      if (req.method === 'GET' && url.pathname === '/api/config/policy') {
        const policy = getHarvestingPolicyFromEnv();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(policy));
        return;
      }

      // 1. Centralized AI Discussion Analysis: POST /api/discussions/analyze
      if (req.method === 'POST' && url.pathname === '/api/discussions/analyze') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const raw = JSON.parse(body);
            const { rawMessages, guildId, channelId, channelName, triggerMessageId, messageUrl } = raw;

            if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'rawMessages array is required' }));
              return;
            }

            // Compute evidence hash for anti-recreation check
            const evidenceString = rawMessages.map((m: any) => m.id || `${m.author}:${m.content}:${m.createdAt}`).join('|');
            const evidenceHash = crypto.createHash('sha256').update(evidenceString).digest('hex');

            if (repo.isEvidenceRejected(evidenceHash)) {
              logger.info(`[Analyze] Skipping analysis for evidence hash [${evidenceHash.slice(0, 8)}] - Previously rejected.`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                found: false,
                summary: '이전에 기각/삭제된 대화 구간입니다. 새 대화가 추가되면 다시 분석됩니다.',
                decisions: []
              }));
              return;
            }

            // Retrieve recent external feedbacks for context injection
            const recentFeedbacks = repo.getRecentFeedbacks(channelId, 3);

            // Build transcript
            const transcript = rawMessages
              .map((m: any) => {
                const time = m.createdAt ? new Date(m.createdAt).toISOString().substring(11, 19) : '';
                const reply = m.replyingTo ? ` (replying to ${m.replyingTo})` : '';
                return `[${time}] ${m.author}${reply}: ${m.content}`;
              })
              .join('\n');

            logger.info(`[Analyze] Analyzing ${rawMessages.length} messages from #${channelName || channelId}...`);
            const extraction = await extractor.analyzeTranscript(transcript, recentFeedbacks);

            if (!extraction.found || extraction.decisions.length === 0) {
              logger.info(`[Analyze] No decisions found in discussion.`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ found: false, summary: extraction.summary, decisions: [] }));
              return;
            }

            const savedDecisions: Decision[] = [];
            let lastConflict: { hasConflict: boolean; conflictingDecision?: Decision } = { hasConflict: false };

            const participants = Array.from(new Set(rawMessages.map((m: any) => m.author))) as string[];
            const rawEvidence = rawMessages.map((m: any) => m.id || m.content).filter(Boolean);

            for (const item of extraction.decisions) {
              const decisionId = `DEC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;

              // Conflict / Pivot check with existing active decisions
              const existingActive = repo.getDecisions({ topic: item.topic, state: 'Decided' });
              const conflicting = existingActive.length > 0 ? existingActive[0] : undefined;
              const isPivot = Boolean(item.isPivot || conflicting);

              if (conflicting) {
                lastConflict = {
                  hasConflict: true,
                  conflictingDecision: conflicting
                };
              }

              const newDecision: Decision = {
                id: decisionId,
                topic: item.topic,
                decision: item.decision,
                title: item.title || item.topic,
                decisionContent: item.decisionContent || item.decision,
                rationale: item.rationale,
                alternatives: item.alternatives || [],
                categoryTag: item.categoryTag || '기타',
                actionItems: item.actionItems || [],
                state: 'Draft', // All new candidates start in Draft state
                supersedesId: null,
                isPivot,
                approvedBy: null,
                decisionConfirmedDate: null,
                feedbackSourceType: null,
                feedbackSourceDetail: null,
                feedbackReceivedDate: null,
                rawEvidence,
                evidenceHash,
                rawTranscript: transcript,
                source: {
                  guildId: guildId || 'discord',
                  channelId: channelId || 'channel',
                  channelName: channelName || undefined,
                  triggerMessageId: triggerMessageId || 'msg-unknown',
                  messageUrl: messageUrl || undefined,
                  participants,
                  rawMessages: rawMessages.map((m: any) => ({
                    id: m.id,
                    author: m.author,
                    content: m.content,
                    createdAt: m.createdAt || new Date().toISOString(),
                    replyingTo: m.replyingTo
                  }))
                },
                messageCreatedAt: rawMessages[rawMessages.length - 1]?.createdAt || new Date().toISOString(),
                createdAt: new Date().toISOString()
              };

              repo.saveDecision(newDecision);
              savedDecisions.push(newDecision);

              logger.info(`[Analyze] Saved DRAFT Decision [${newDecision.id}] Title="${newDecision.title}" Category="${newDecision.categoryTag}"`);
            }

            // Update checkpoint for channel
            if (channelId && triggerMessageId) {
              repo.saveCheckpoint(channelId, triggerMessageId);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              found: true,
              summary: extraction.summary,
              decisions: savedDecisions,
              hasConflict: lastConflict.hasConflict,
              conflictingDecision: lastConflict.conflictingDecision
            }));
          } catch (err: any) {
            logger.error(`[Analyze] Error processing discussion analysis: ${err.message}`, { stack: err.stack });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        });
        return;
      }

      // 2. Decision Review Operations: POST /api/decisions/:id/review
      const reviewMatch = url.pathname.match(/^\/api\/decisions\/([^/]+)\/review$/);
      if (req.method === 'POST' && reviewMatch) {
        const decisionId = reviewMatch[1];
        let body = '';
        req.on('data', chunk => body += chunk);
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
            const updated = repo.reviewDecision(decisionId, action, {
              approvedBy,
              title,
              decisionContent,
              rationale,
              categoryTag
            });

            if (!updated) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Decision not found' }));
              return;
            }

            logger.info(`[Review] Decision [${decisionId}] reviewed with action: ${action} -> state: ${updated.state}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', decision: updated }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 3. External Feedbacks: GET & POST /api/feedbacks
      if (url.pathname === '/api/feedbacks') {
        if (req.method === 'GET') {
          const channelId = url.searchParams.get('channelId') || undefined;
          const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
          const feedbacks = repo.getRecentFeedbacks(channelId, limit);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ feedbacks }));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const raw = JSON.parse(body);
              const parsed = ExternalFeedbackSchema.safeParse(raw);
              if (!parsed.success) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid ExternalFeedback', details: parsed.error.issues }));
                return;
              }

              repo.saveFeedback(parsed.data);
              logger.info(`[Feedback] Saved External Feedback [${parsed.data.id}] Source="${parsed.data.source}"`);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', id: parsed.data.id }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }
      }

      // 4. Channel Checkpoints: GET & POST /api/channels/:channelId/checkpoint
      const checkpointMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/checkpoint$/);
      if (checkpointMatch) {
        const channelId = checkpointMatch[1];

        if (req.method === 'GET') {
          const lastMessageId = repo.getCheckpoint(channelId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ channelId, lastMessageId }));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { lastMessageId } = JSON.parse(body);
              if (!lastMessageId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'lastMessageId is required' }));
                return;
              }
              repo.saveCheckpoint(channelId, lastMessageId);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', channelId, lastMessageId }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }
      }

      // 5. Resolve Conflict: POST /api/decisions/resolve-conflict
      if (req.method === 'POST' && url.pathname === '/api/decisions/resolve-conflict') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { decisionId, conflictingId, resolution } = JSON.parse(body);
            if (resolution === 'supersede' && conflictingId && decisionId) {
              const current = repo.getDecisionById(decisionId);
              if (current) {
                current.supersedesId = conflictingId;
                current.state = 'Decided';
                repo.saveDecision(current);
                logger.info(`[Conflict] Decision [${decisionId}] now supersedes [${conflictingId}]`);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 6. Webhook ingestion: POST /api/webhooks/decisions (backward compatibility)
      if (req.method === 'POST' && url.pathname === '/api/webhooks/decisions') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const raw = JSON.parse(body);
            const parsed = DecisionPayloadSchema.safeParse(raw);

            if (!parsed.success) {
              logger.warn(`[Webhook] Rejected malformed payload: ${JSON.stringify(parsed.error.issues)}`);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid DecisionPayload', details: parsed.error.issues }));
              return;
            }

            const decision = parsed.data.payload;
            repo.saveDecision(decision);

            logger.info(`[Webhook] Successfully saved decision [${decision.id}] Topic="${decision.topic}"`);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', id: decision.id }));
          } catch (err: any) {
            logger.error(`[Webhook] Error parsing JSON body: ${err.message}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          }
        });
        return;
      }

      // 7. Query decisions: GET /api/decisions
      if (req.method === 'GET' && url.pathname === '/api/decisions') {
        const topic = url.searchParams.get('topic') || undefined;
        const state = url.searchParams.get('state') || undefined;
        const categoryTag = url.searchParams.get('categoryTag') || undefined;

        const decisions = repo.getDecisions({ topic, state, categoryTag });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ decisions }));
        return;
      }

      logger.warn(`[HTTP] Route not found: ${req.method} ${url.pathname}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
  });
}
