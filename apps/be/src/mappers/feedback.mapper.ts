import { ExternalFeedback } from '@ggaddak/shared';
import { FeedbackDbRow } from '../models/feedback.entity.js';

export class FeedbackMapper {
  static toDomain(row: FeedbackDbRow): ExternalFeedback {
    return {
      id: row.id,
      source: row.source as any,
      detail: row.detail || undefined,
      content: row.content,
      channelId: row.channel_id || 'global',
      createdAt: row.created_at,
    };
  }
}
