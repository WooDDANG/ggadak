import { Request, Response, NextFunction } from 'express';
import { CheckpointService } from '../../services/checkpoint.service.js';
import { SaveCheckpointDtoSchema } from '../../dto/checkpoint.dto.js';
import { BadRequestError } from '../../errors/AppError.js';

export class CheckpointController {
  constructor(private service: CheckpointService) {}

  getCheckpoint = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const channelId = Array.isArray(req.params.channelId)
        ? req.params.channelId[0]
        : req.params.channelId;
      const lastMessageId = this.service.getCheckpoint(channelId);
      res.status(200).json({ channelId, lastMessageId });
    } catch (err) {
      next(err);
    }
  };

  saveCheckpoint = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const channelId = Array.isArray(req.params.channelId)
        ? req.params.channelId[0]
        : req.params.channelId;
      const parsed = SaveCheckpointDtoSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new BadRequestError('Invalid checkpoint payload', parsed.error.issues);
      }

      this.service.saveCheckpoint(channelId, parsed.data.lastMessageId);
      res.status(200).json({ status: 'ok', channelId, lastMessageId: parsed.data.lastMessageId });
    } catch (err) {
      next(err);
    }
  };
}
