import http from 'node:http';
import morgan from 'morgan';
import { DecisionPayloadSchema, Decision, createLogger } from '@ggaddak/shared';
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

            // Build transcript
            const transcript = rawMessages
              .map((m: any) => {
                const time = m.createdAt ? new Date(m.createdAt).toISOString().substring(11, 19) : '';
                const reply = m.replyingTo ? ` (replying to ${m.replyingTo})` : '';
                return `[${time}] ${m.author}${reply}: ${m.content}`;
              })
              .join('\n');

            logger.info(`[Analyze] Analyzing ${rawMessages.length} messages from #${channelName || channelId}...`);
            const extraction = await extractor.analyzeTranscript(transcript);

            if (!extraction.found || extraction.decisions.length === 0) {
              logger.info(`[Analyze] No decisions found in discussion.`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ found: false, summary: extraction.summary, decisions: [] }));
              return;
            }

            const savedDecisions: Decision[] = [];
            let lastConflict: { hasConflict: boolean; conflictingDecision?: Decision } = { hasConflict: false };

            const participants = Array.from(new Set(rawMessages.map((m: any) => m.author))) as string[];

            for (const item of extraction.decisions) {
              const decisionId = `DEC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
              
              // Conflict check with existing active decisions
              const existingActive = repo.getDecisions({ topic: item.topic, state: 'Decided' });
              const conflicting = existingActive.length > 0 ? existingActive[0] : undefined;

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
                rationale: item.rationale,
                actionItems: item.actionItems,
                state: 'Decided',
                supersedesId: null,
                rawTranscript: transcript,
                source: {
                  guildId: guildId || 'discord',
                  channelId: channelId || 'channel',
                  channelName: channelName || undefined,
                  triggerMessageId: triggerMessageId || 'msg-unknown',
                  messageUrl: messageUrl || undefined,
                  participants,
                  rawMessages: rawMessages.map((m: any) => ({
                    author: m.author,
                    content: m.content,
                    createdAt: m.createdAt || new Date().toISOString(),
                    replyingTo: m.replyingTo
                  }))
                },
                createdAt: new Date().toISOString()
              };

              repo.saveDecision(newDecision);
              savedDecisions.push(newDecision);

              logger.info(`[Analyze] Saved Decision [${newDecision.id}] Topic="${newDecision.topic}" DecisionsCount=${savedDecisions.length}`);
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

      // 2. Resolve Conflict: POST /api/decisions/resolve-conflict
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
                repo.saveDecision(current); // saveDecision automatically updates conflictingId to 'Superseded'
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

      // 3. Webhook ingestion: POST /api/webhooks/decisions (backward compatibility)
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

      // 4. Query decisions: GET /api/decisions
      if (req.method === 'GET' && url.pathname === '/api/decisions') {
        const topic = url.searchParams.get('topic') || undefined;
        const state = url.searchParams.get('state') || undefined;

        const decisions = repo.getDecisions({ topic, state });
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
