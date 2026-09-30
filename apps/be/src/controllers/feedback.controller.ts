import { IncomingMessage, ServerResponse } from 'node:http';
import { ExternalFeedbackSchema } from '@ggaddak/shared';
import { FeedbackService } from '../services/feedback.service.js';

export class FeedbackController {
  constructor(private service: FeedbackService) {}

  getFeedbacks(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const channelId = url.searchParams.get('channelId') || undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 10;
    const feedbacks = this.service.getFeedbacks(channelId, limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ feedbacks }));
  }

  saveFeedback(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const raw = JSON.parse(body);
        const parsed = ExternalFeedbackSchema.safeParse(raw);
        if (!parsed.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Invalid ExternalFeedback',
              details: parsed.error.issues,
            }),
          );
          return;
        }

        this.service.saveFeedback(parsed.data);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', id: parsed.data.id }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
}
