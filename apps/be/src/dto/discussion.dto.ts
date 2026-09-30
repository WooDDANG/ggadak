import { z } from 'zod';
import { Decision } from '@ggaddak/shared';

export const RawMessageItemDtoSchema = z.object({
  id: z.string().optional(),
  author: z.string(),
  content: z.string(),
  createdAt: z.string().optional(),
  replyingTo: z.string().optional(),
});

export const AnalyzeDiscussionRequestDtoSchema = z.object({
  rawMessages: z.array(RawMessageItemDtoSchema).min(1, 'rawMessages array must not be empty'),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  triggerMessageId: z.string().optional(),
  messageUrl: z.string().optional(),
});

export type AnalyzeDiscussionRequestDto = z.infer<typeof AnalyzeDiscussionRequestDtoSchema>;

export interface AnalyzeDiscussionResponseDto {
  found: boolean;
  summary: string;
  decisions: Decision[];
  hasConflict?: boolean;
  conflictingDecision?: Decision;
}
