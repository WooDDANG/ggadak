import { Request, Response } from 'express';
import { CheckpointService } from '../services/checkpoint.service.js';

export class CheckpointController {
  constructor(private service: CheckpointService) {}

  getCheckpoint = (req: Request, res: Response): void => {
    const channelId = Array.isArray(req.params.channelId)
      ? req.params.channelId[0]
      : req.params.channelId;
    const lastMessageId = this.service.getCheckpoint(channelId);
    res.status(200).json({ channelId, lastMessageId });
  };

  saveCheckpoint = (req: Request, res: Response): void => {
    const channelId = Array.isArray(req.params.channelId)
      ? req.params.channelId[0]
      : req.params.channelId;
    const { lastMessageId } = req.body || {};

    if (!lastMessageId) {
      res.status(400).json({ error: 'lastMessageId is required' });
      return;
    }

    this.service.saveCheckpoint(channelId, lastMessageId);
    res.status(200).json({ status: 'ok', channelId, lastMessageId });
  };
}
