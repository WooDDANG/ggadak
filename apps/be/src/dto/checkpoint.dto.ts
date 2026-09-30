import { z } from 'zod';

export interface SaveCheckpointDto {
  lastMessageId: string;
}

export const SaveCheckpointDtoSchema = z.object({
  lastMessageId: z.string().min(1, 'lastMessageId is required'),
});

export interface CheckpointResponseDto {
  channelId: string;
  lastMessageId: string | null;
}
