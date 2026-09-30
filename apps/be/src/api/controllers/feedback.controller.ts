import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../../services/feedback.service.js';
import { CreateFeedbackDtoSchema, QueryFeedbacksDtoSchema } from '../../dto/feedback.dto.js';
import { BadRequestError } from '../../errors/AppError.js';

export class FeedbackController {
  constructor(private service: FeedbackService) {}

  getFeedbacks = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = QueryFeedbacksDtoSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }
      const feedbacks = this.service.getFeedbacks(parsed.data.channelId, parsed.data.limit);
      res.status(200).json({ feedbacks });
    } catch (err) {
      next(err);
    }
  };

  saveFeedback = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = CreateFeedbackDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid ExternalFeedback payload', parsed.error.issues);
      }

      this.service.saveFeedback(parsed.data);
      res.status(201).json({ status: 'ok', id: parsed.data.id });
    } catch (err) {
      next(err);
    }
  };
}
