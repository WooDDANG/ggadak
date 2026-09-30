import { Service } from 'typedi';
import { ExternalFeedback, createLogger } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';

const logger = createLogger('BE-FEEDBACK-SERVICE');

@Service()
export class FeedbackService {
  constructor(private repo: DecisionRepository) {}

  saveFeedback(feedback: ExternalFeedback): void {
    this.repo.saveFeedback(feedback);
    logger.info(`[Feedback] Saved External Feedback [${feedback.id}] Source="${feedback.source}"`);
  }

  getFeedbacks(channelId?: string, limit = 10): ExternalFeedback[] {
    return this.repo.getRecentFeedbacks(channelId, limit);
  }
}
