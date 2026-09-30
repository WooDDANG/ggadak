import { Request, Response } from 'express';
import { createLogger } from '@ggaddak/shared';
import { DiscussionService } from '../services/discussion.service.js';

const logger = createLogger('BE-DISCUSSION-CONTROLLER');

export class DiscussionController {
  constructor(private service: DiscussionService) {}

  analyzeDiscussion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { rawMessages, guildId, channelId, channelName, triggerMessageId, messageUrl } =
        req.body || {};

      if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        res.status(400).json({ error: 'rawMessages array is required' });
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

      res.status(200).json(result);
    } catch (err: any) {
      logger.error(`[Analyze] Error processing discussion analysis: ${err.message}`, {
        stack: err.stack,
      });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}
