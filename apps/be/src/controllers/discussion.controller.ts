import { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '@ggaddak/shared';
import { DiscussionService } from '../services/discussion.service.js';

const logger = createLogger('BE-DISCUSSION-CONTROLLER');

export class DiscussionController {
  constructor(private service: DiscussionService) {}

  analyzeDiscussion(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const raw = JSON.parse(body);
        const { rawMessages, guildId, channelId, channelName, triggerMessageId, messageUrl } = raw;

        if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'rawMessages array is required' }));
          return;
        }

        const result = await this.service.analyzeDiscussion({
          rawMessages,
          guildId,
          channelId,
          channelName,
          triggerMessageId,
          messageUrl,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        logger.error(`[Analyze] Error processing discussion analysis: ${err.message}`, {
          stack: err.stack,
        });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    });
  }
}
