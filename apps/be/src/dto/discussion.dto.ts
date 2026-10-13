import type { AnalyzeDiscussionParams, DiscussionMessage } from '../domain/analysis.js';
import { z } from 'zod';
import { DecisionItemDto } from './decision.dto.js';

export type RawMessageItemDto = DiscussionMessage;

export const RawMessageItemDtoSchema = z.object({
  isBot: z.boolean().optional(),
  id: z.string().trim().min(1),
  author: z.string(),
  content: z.string(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  replyingTo: z.string().optional(),
  reactionCount: z.number().int().nonnegative().optional(),
  reactions: z
    .array(
      z
        .object({
          emoji: z.string(),
          count: z.number().int().nonnegative(),
          botCount: z.number().int().nonnegative().optional(),
        })
        .refine(r => (r.botCount || 0) <= r.count),
    )
    .optional(),
  isTrigger: z.boolean().optional(),
});

export interface AnalyzeDiscussionRequestDto extends AnalyzeDiscussionParams {
  rawMessages: RawMessageItemDto[];
}

export const AnalyzeDiscussionRequestDtoSchema = z.object({
  requestId: z.string().trim().min(1),
  rawMessages: z.array(RawMessageItemDtoSchema).min(1, 'rawMessages array must not be empty'),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  triggerMessageId: z.string().optional(),
  messageUrl: z.string().optional(),
  isManualOverride: z.boolean().optional(),
  traceId: z.string().optional(),
  score: z.number().optional(),
  participantCount: z.number().int().nonnegative().optional(),
  reactionsCount: z.number().int().nonnegative().optional(),
});

export interface AnalyzeDiscussionResponseDto {
  found: boolean;
  summary: string;
  decisions: DecisionItemDto[];
  hasConflict?: boolean;
  conflictingDecision?: DecisionItemDto;
}
