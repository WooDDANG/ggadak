import { z } from 'zod';
import { ExternalFeedbackSchema } from '@ggaddak/shared';

export type FeedbackSourceType = '교수' | '심사위원' | '팀원' | '인터뷰이';

export interface ExternalFeedbackItemDto {
  id: string;
  source: FeedbackSourceType;
  detail?: string;
  content: string;
  channelId: string;
  createdAt: string;
}

export const CreateFeedbackDtoSchema = ExternalFeedbackSchema;

export interface CreateFeedbackDto {
  id: string;
  source: FeedbackSourceType;
  detail?: string;
  content: string;
  channelId: string;
  createdAt: string;
}

export const QueryFeedbacksDtoSchema = z.object({
  channelId: z.string().optional(),
  limit: z.coerce.number().optional().default(10),
});

export interface QueryFeedbacksDto {
  channelId?: string;
  limit?: number;
}

export interface FeedbackListResponseDto {
  feedbacks: ExternalFeedbackItemDto[];
}
