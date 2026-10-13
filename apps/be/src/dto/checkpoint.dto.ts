import { z } from 'zod';

export interface SaveCheckpointDto {
  lastMessageId: string;
}

export const SaveCheckpointDtoSchema = z.object({
  lastMessageId: z.string().regex(/^\d+$/, 'A Discord message ID is required'),
});

export interface CheckpointResponseDto {
  channelId: string;
  lastMessageId: string | null;
}
