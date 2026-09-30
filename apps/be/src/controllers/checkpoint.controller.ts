import { IncomingMessage, ServerResponse } from 'node:http';
import { CheckpointService } from '../services/checkpoint.service.js';

export class CheckpointController {
  constructor(private service: CheckpointService) {}

  getCheckpoint(_req: IncomingMessage, res: ServerResponse, channelId: string): void {
    const lastMessageId = this.service.getCheckpoint(channelId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ channelId, lastMessageId }));
  }

  saveCheckpoint(req: IncomingMessage, res: ServerResponse, channelId: string): void {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { lastMessageId } = JSON.parse(body);
        if (!lastMessageId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'lastMessageId is required' }));
          return;
        }
        this.service.saveCheckpoint(channelId, lastMessageId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', channelId, lastMessageId }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
}
