import { z } from 'zod';

export const DecisionStateSchema = z.enum([
  'Proposed',
  'Discussing',
  'Decided',
  'Superseded'
]);

export const ActionItemSchema = z.object({
  task: z.string().min(1),
  assignee: z.string().optional(),
  dueDate: z.string().optional()
});

export const RawMessageEntrySchema = z.object({
  author: z.string(),
  content: z.string(),
  createdAt: z.string(),
  replyingTo: z.string().optional()
});

export const DiscordSourceSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  threadId: z.string().optional(),
  triggerMessageId: z.string(),
  messageUrl: z.string().url().optional(),
  participants: z.array(z.string()).default([]),
  rawMessages: z.array(RawMessageEntrySchema).default([])
});

export const DecisionSchema = z.object({
  id: z.string(),
  topic: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  actionItems: z.array(ActionItemSchema).default([]),
  state: DecisionStateSchema.default('Decided'),
  supersedesId: z.string().nullable().default(null),
  rawTranscript: z.string().optional(),
  source: DiscordSourceSchema,
  createdAt: z.string().datetime()
});

export const DecisionPayloadSchema = z.object({
  event: z.literal('decision.recorded'),
  version: z.literal('1.0.0'),
  payload: DecisionSchema
});
