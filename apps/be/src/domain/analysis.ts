import type { Decision } from '@ggaddak/shared';

export interface DiscussionMessage {
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

export interface AnalyzeDiscussionParams {
  requestId: string;
  rawMessages: DiscussionMessage[];
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

export interface AnalyzeDiscussionResult {
  found: boolean;
  summary: string;
  decisions: Decision[];
  hasConflict?: boolean;
  conflictingDecision?: Decision;
}
