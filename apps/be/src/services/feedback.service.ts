import { Service } from 'typedi';
import { ExternalFeedback, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-FEEDBACK-SERVICE');

@Service()
export class FeedbackService {
  constructor(private repo: DecisionRepository) {}

  async saveFeedback(feedback: ExternalFeedback): Promise<void> {
    await this.repo.saveFeedback(feedback);
    logger.info(`[Feedback] Saved External Feedback [${feedback.id}] Source="${feedback.source}"`);
  }

  async getFeedbacks(channelId?: string, limit = 10): Promise<ExternalFeedback[]> {
    return this.repo.getRecentFeedbacks(channelId, limit);
  }
}
