import { z } from 'zod';
import { DecisionItemDto } from './decision.dto.js';

export interface RawMessageItemDto {
  id?: string;
  author: string;
  content: string;
  createdAt?: string;
  replyingTo?: string;
  reactionCount?: number;
  reactions?: Array<{ emoji: string; count: number }>;
  isTrigger?: boolean;
}

export const RawMessageItemDtoSchema = z.object({
  id: z.string().optional(),
  author: z.string(),
  content: z.string(),
  createdAt: z.string().optional(),
  replyingTo: z.string().optional(),
  reactionCount: z.number().optional(),
  reactions: z.array(z.object({ emoji: z.string(), count: z.number() })).optional(),
  isTrigger: z.boolean().optional(),
});

export interface AnalyzeDiscussionRequestDto {
  rawMessages: RawMessageItemDto[];
  guildId?: string;
  channelId?: string;
  channelName?: string;
  triggerMessageId?: string;
  messageUrl?: string;
  isManualOverride?: boolean;
  score?: number;
  participantCount?: number;
  reactionsCount?: number;
}

export const AnalyzeDiscussionRequestDtoSchema = z.object({
  rawMessages: z.array(RawMessageItemDtoSchema).min(1, 'rawMessages array must not be empty'),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  triggerMessageId: z.string().optional(),
  messageUrl: z.string().optional(),
  isManualOverride: z.boolean().optional(),
  score: z.number().optional(),
  participantCount: z.number().optional(),
  reactionsCount: z.number().optional(),
});

export interface AnalyzeDiscussionResponseDto {
  found: boolean;
  summary: string;
  decisions: DecisionItemDto[];
  hasConflict?: boolean;
  conflictingDecision?: DecisionItemDto;
}
