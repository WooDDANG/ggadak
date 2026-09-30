import { z } from 'zod';

export const DecisionStateSchema = z.enum([
  'Draft',
  'Proposed',
  'Discussing',
  'Decided',
  'Deferred',
  'Superseded',
  'Rejected',
]);

export const CategoryTagSchema = z.enum(['타깃', '문제정의', '기능', '기술', 'BM', '기타']);

export const FeedbackSourceTypeSchema = z.enum(['교수', '심사위원', '팀원', '인터뷰이']);

export const AlternativeOptionSchema = z.object({
  option: z.string(),
  reason: z.string(),
});

export const ActionItemSchema = z.object({
  task: z.string().min(1),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
});

export const RawMessageEntrySchema = z.object({
  id: z.string().optional(),
  author: z.string(),
  content: z.string(),
  createdAt: z.string(),
  replyingTo: z.string().optional(),
});

export const DiscordSourceSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  threadId: z.string().optional(),
  triggerMessageId: z.string(),
  messageUrl: z.string().url().optional(),
  participants: z.array(z.string()).default([]),
  rawMessages: z.array(RawMessageEntrySchema).default([]),
});

export const DecisionSchema = z.object({
  id: z.string(),
  // Core Decision Content
  topic: z.string().min(1),
  decision: z.string().min(1),
  title: z.string().optional(),
  decisionContent: z.string().optional(),
  rationale: z.string().min(1),
  rationaleSummary: z.string().optional(),
  rationaleQuotes: z.array(z.string()).default([]),
  alternatives: z.array(AlternativeOptionSchema).default([]),
  categoryTag: CategoryTagSchema.default('기타'),
  actionItems: z.array(ActionItemSchema).default([]),
  // State Machine & Audit
  state: DecisionStateSchema.default('Draft'),
  supersedesId: z.string().nullable().default(null),
  isPivot: z.boolean().default(false),
  approvedBy: z.string().nullable().default(null),
  decisionConfirmedDate: z.string().nullable().default(null),
  // Feedback Linkage
  feedbackSourceType: FeedbackSourceTypeSchema.nullable().default(null),
  feedbackSourceDetail: z.string().nullable().default(null),
  feedbackReceivedDate: z.string().nullable().default(null),
  // Evidence & Source
  rawEvidence: z.array(z.string()).default([]),
  evidenceHash: z.string().optional(),
  rawTranscript: z.string().optional(),
  source: DiscordSourceSchema,
  messageCreatedAt: z.string().optional(),
  createdAt: z.string().datetime(),
  governanceScore: z.number().optional(),
  governanceReason: z.string().optional(),
  governancePassed: z.boolean().optional(),
});

export const DecisionPayloadSchema = z.object({
  event: z.literal('decision.recorded'),
  version: z.literal('1.0.0'),
  payload: DecisionSchema,
});

export const ChannelCheckpointSchema = z.object({
  channelId: z.string(),
  lastMessageId: z.string(),
  updatedAt: z.string(),
});

export const ExternalFeedbackSchema = z.object({
  id: z.string(),
  source: FeedbackSourceTypeSchema,
  detail: z.string().optional(),
  content: z.string().min(1),
  channelId: z.string(),
  createdAt: z.string(),
});

export const ReviewActionSchema = z.object({
  action: z.enum(['confirm', 'defer', 'reject', 'edit']),
  approvedBy: z.string().optional(),
  title: z.string().optional(),
  decisionContent: z.string().optional(),
  rationale: z.string().optional(),
  rationaleSummary: z.string().optional(),
  rationaleQuotes: z.array(z.string()).optional(),
  categoryTag: CategoryTagSchema.optional(),
});
