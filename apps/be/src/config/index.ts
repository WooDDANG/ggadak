import dotenv from 'dotenv';
import { DEFAULT_HARVESTING_POLICY, HarvestingPolicyConfig, getHarvestingPolicyFromEnv } from '@ggaddak/shared';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  cors: {
    origins: string[];
  };
  harvestingPolicy: HarvestingPolicyConfig;
  ai: {
    provider: string;
    geminiApiKey?: string;
    openaiApiKey?: string;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  cors: {
    origins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),
  },
  harvestingPolicy: getHarvestingPolicyFromEnv() || DEFAULT_HARVESTING_POLICY,
  ai: {
    provider: process.env.AI_PROVIDER || (process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini' : (process.env.OPENAI_API_KEY ? 'openai' : 'mock')),
    geminiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
};

export default config;
