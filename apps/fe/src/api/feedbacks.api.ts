import { ExternalFeedback } from '@ggaddak/shared';
import { apiClient } from './client';

export const feedbacksApi = {
  getFeedbacks: async (channelId?: string, limit: number = 20): Promise<ExternalFeedback[]> => {
    const query = new URLSearchParams();
    if (channelId) query.set('channelId', channelId);
    query.set('limit', String(limit));

    const data = await apiClient<{ feedbacks: ExternalFeedback[] }>(
      `/api/feedbacks?${query.toString()}`,
    );
    return data.feedbacks;
  },

  createFeedback: async (feedback: ExternalFeedback): Promise<void> => {
    await apiClient<{ status: string; id: string }>('/api/feedbacks', {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  },
};
