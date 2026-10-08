import { Message, TextChannel, Guild } from 'discord.js';
import { Decision, HarvestingPolicyConfig } from '@ggaddak/shared';
import { ScanOptions } from './harvester.service.js';

export type HarvestTrigger =
  | { type: 'EVENT'; message: Message; isManualOverride?: boolean; traceId?: string }
  | { type: 'SCAN_CHANNEL'; channel: TextChannel; options?: ScanOptions; traceId?: string }
  | { type: 'SCAN_GUILD'; guild: Guild; options?: ScanOptions; traceId?: string };

export interface HarvestResult {
  success: boolean;
  decisions: Decision[];
  messageCount: number;
  summary?: string;
  traceId?: string;
  channelCount?: number;
}

export interface DecisionSink {
  analyzeDiscussion(payload: any): Promise<any>;
}

export interface IDecisionHarvestingEngine {
  harvest(trigger: HarvestTrigger, policy?: HarvestingPolicyConfig): Promise<HarvestResult>;
}
