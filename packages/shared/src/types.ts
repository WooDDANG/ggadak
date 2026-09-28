import { z } from 'zod';
import {
  DecisionStateSchema,
  ActionItemSchema,
  DiscordSourceSchema,
  DecisionSchema,
  DecisionPayloadSchema
} from './schemas.js';

export type DecisionState = z.infer<typeof DecisionStateSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type DiscordSource = z.infer<typeof DiscordSourceSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type DecisionPayload = z.infer<typeof DecisionPayloadSchema>;
