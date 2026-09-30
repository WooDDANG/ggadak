import { z } from 'zod';

export const SaveCheckpointDtoSchema = z.object({
  lastMessageId: z.string().min(1, 'lastMessageId is required'),
});
export type SaveCheckpointDto = z.infer<typeof SaveCheckpointDtoSchema>;

export interface CheckpointResponseDto {
  channelId: string;
  lastMessageId: string | null;
}
