import { Message, TextChannel, Guild } from 'discord.js';
import { Decision, HarvestingPolicyConfig } from '@ggaddak/shared';
import { ScanOptions } from './harvester.service.js';

export type HarvestTrigger =
  | { type: 'EVENT'; message: Message; isManualOverride?: boolean; traceId?: string }
  | { type: 'SCAN'; target: TextChannel | Guild; options?: ScanOptions; traceId?: string };

export interface HarvestResult {
  success: boolean;
  outcome?:
    | 'accepted'
    | 'completed-with-candidates'
    | 'completed-no-decision'
    | 'retry-pending'
    | 'retained-failure'
    | 'merged'
    | 'canceled';
  pendingAnalysis?: boolean;
  decisions: Decision[];
  decisionsCount: number;
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
