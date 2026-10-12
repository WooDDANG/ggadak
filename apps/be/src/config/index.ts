import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import dotenv from 'dotenv';
import {
  DEFAULT_HARVESTING_POLICY,
  HarvestingPolicyConfig,
  getHarvestingPolicyFromEnv,
} from '@ggaddak/shared';

dotenv.config();

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  secret: string;
  secureCookie: boolean;
}

const AuthConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z
    .string()
    .url()
    .refine(value => /^https?:\/\//.test(value)),
  secret: z.string().min(32),
  secureCookie: z.boolean(),
});

// Validate when login is used so installations with only Bot service auth can start.
export function validateAuthConfig(auth: AuthConfig): void {
  if (!AuthConfigSchema.safeParse(auth).success)
    throw new AppError('Discord login is not configured', 503);
}

export function parseAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    clientId: env.DISCORD_CLIENT_ID ?? '',
    clientSecret: env.DISCORD_CLIENT_SECRET ?? '',
    redirectUri: env.DISCORD_REDIRECT_URI ?? '',
    secret: env.AUTH_SECRET ?? '',
    secureCookie: env.NODE_ENV === 'production',
  };
}

export interface AppConfig {
  auth: AuthConfig;
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
  // index.ts discovers workspace/root .env files after ESM dependencies initialize.
  // Snapshot auth when the service is constructed, after that discovery completes.
  get auth() {
    return parseAuthConfig(process.env);
  },
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map(s => s.trim())
      .filter(origin => origin && origin !== '*'),
  },
  harvestingPolicy: getHarvestingPolicyFromEnv() || DEFAULT_HARVESTING_POLICY,
  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    geminiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
};

export default config;
