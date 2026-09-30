import { z } from 'zod';
import {
  DecisionStateSchema,
  CategoryTagSchema,
  FeedbackSourceTypeSchema,
  AlternativeOptionSchema,
  ActionItemSchema,
  DiscordSourceSchema,
  DecisionSchema,
  DecisionPayloadSchema,
  ChannelCheckpointSchema,
  ExternalFeedbackSchema,
  ReviewActionSchema
} from './schemas.js';

export type DecisionState = z.infer<typeof DecisionStateSchema>;
export type CategoryTag = z.infer<typeof CategoryTagSchema>;
export type FeedbackSourceType = z.infer<typeof FeedbackSourceTypeSchema>;
export type AlternativeOption = z.infer<typeof AlternativeOptionSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type DiscordSource = z.infer<typeof DiscordSourceSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type DecisionPayload = z.infer<typeof DecisionPayloadSchema>;
export type ChannelCheckpoint = z.infer<typeof ChannelCheckpointSchema>;
export type ExternalFeedback = z.infer<typeof ExternalFeedbackSchema>;
export type ReviewAction = z.infer<typeof ReviewActionSchema>;
