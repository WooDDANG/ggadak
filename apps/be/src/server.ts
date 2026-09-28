import http from 'node:http';
import { DecisionPayloadSchema } from '@ggaddak/shared';
import { DecisionRepository } from './db.js';

export function createServer(repo: DecisionRepository) {
  return http.createServer(async (req, res) => {
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

    // Webhook ingestion: POST /api/webhooks/decisions
    if (req.method === 'POST' && url.pathname === '/api/webhooks/decisions') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const raw = JSON.parse(body);
          const parsed = DecisionPayloadSchema.safeParse(raw);

          if (!parsed.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid DecisionPayload', details: parsed.error.issues }));
            return;
          }

          const decision = parsed.data.payload;
          repo.saveDecision(decision);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', id: decision.id }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
        }
      });
      return;
    }

    // Query decisions: GET /api/decisions
    if (req.method === 'GET' && url.pathname === '/api/decisions') {
      const topic = url.searchParams.get('topic') || undefined;
      const state = url.searchParams.get('state') || undefined;

      const decisions = repo.getDecisions({ topic, state });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ decisions }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
}
