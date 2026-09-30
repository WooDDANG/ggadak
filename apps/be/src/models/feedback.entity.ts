import { ExternalFeedback } from '@ggaddak/shared';

export interface FeedbackDbRow {
  id: string;
  source: string;
  detail: string | null;
  content: string;
  channel_id: string | null;
  created_at: string;
}

export type FeedbackEntity = ExternalFeedback;
