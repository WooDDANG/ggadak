import { Request, Response, NextFunction } from 'express';
import { DiscussionService } from '../../services/discussion.service.js';
import { AnalyzeDiscussionRequestDtoSchema } from '../../dto/discussion.dto.js';
import { BadRequestError } from '../../errors/AppError.js';

export class DiscussionController {
  constructor(private service: DiscussionService) {}

  analyzeDiscussion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AnalyzeDiscussionRequestDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid AnalyzeDiscussion payload', parsed.error.issues);
      }

      const result = await this.service.analyzeDiscussion(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}
