import { Request, Response } from 'express';
import { ExternalFeedbackSchema } from '@ggaddak/shared';
import { FeedbackService } from '../services/feedback.service.js';

export class FeedbackController {
  constructor(private service: FeedbackService) {}

  getFeedbacks = (req: Request, res: Response): void => {
    const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const feedbacks = this.service.getFeedbacks(channelId, limit);
    res.status(200).json({ feedbacks });
  };

  saveFeedback = (req: Request, res: Response): void => {
    const parsed = ExternalFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid ExternalFeedback',
        details: parsed.error.issues,
      });
      return;
    }

    this.service.saveFeedback(parsed.data);
    res.status(201).json({ status: 'ok', id: parsed.data.id });
  };
}
