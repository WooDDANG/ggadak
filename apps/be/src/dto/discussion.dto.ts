import { z } from 'zod';
import { DecisionItemDto } from './decision.dto.js';

export interface RawMessageItemDto {
  isBot?: boolean;
  id: string;
  author: string;
  content: string;
  createdAt?: string;
  replyingTo?: string;
  reactionCount?: number;
  reactions?: Array<{ emoji: string; count: number; botCount?: number }>;
  isTrigger?: boolean;
}

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

export interface AnalyzeDiscussionRequestDto {
  requestId: string;
  rawMessages: RawMessageItemDto[];
  guildId?: string;
  channelId?: string;
  channelName?: string;
  triggerMessageId?: string;
  messageUrl?: string;
  isManualOverride?: boolean;
  traceId?: string;
  score?: number;
  participantCount?: number;
  reactionsCount?: number;
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
