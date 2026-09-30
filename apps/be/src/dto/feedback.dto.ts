import { z } from 'zod';
import { ExternalFeedback, ExternalFeedbackSchema } from '@ggaddak/shared';

export const CreateFeedbackDtoSchema = ExternalFeedbackSchema;
export type CreateFeedbackDto = z.infer<typeof CreateFeedbackDtoSchema>;

export const QueryFeedbacksDtoSchema = z.object({
  channelId: z.string().optional(),
  limit: z.coerce.number().optional().default(10),
});
export type QueryFeedbacksDto = z.infer<typeof QueryFeedbacksDtoSchema>;

export interface FeedbackListResponseDto {
  feedbacks: ExternalFeedback[];
}
