import { AiDefaults, GraphPolicy } from './policies.js';
import {
  DEFAULT_HARVESTING_POLICY,
  getHarvestingPolicyFromEnv,
  HarvestingPolicyConfig,
  ServiceDefaults,
} from '@ggaddak/shared';
import { AiStage } from '../domain/ai-call.js';
import { z } from 'zod';
import { AuthConfigurationError } from '../errors/AuthConfigurationError.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

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
  const result = AuthConfigSchema.safeParse(auth);
  if (!result.success) {
    throw new AuthConfigurationError(
      result.error.issues.map(issue => issue.path[0] as keyof AuthConfig),
    );
  }
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
    model?: string;
    stageModels?: Partial<Record<AiStage, string>>;
    agyExecutable?: string;
    nvidiaApiKey?: string;
    nvidiaBaseUrl?: string;
    nvidiaEnableThinking?: boolean;
    callTimeoutMs?: number;
  };
}

export const config: AppConfig = {
  get auth() {
    return parseAuthConfig(process.env);
  },
  port: parseInt(process.env.PORT || String(ServiceDefaults.backendPort), 10),
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3002')
      .split(',')
      .map(s => s.trim())
      .filter(origin => origin && origin !== '*'),
  },
  harvestingPolicy: getHarvestingPolicyFromEnv() || DEFAULT_HARVESTING_POLICY,
  get ai() {
    return {
      provider: process.env.AI_PROVIDER || AiDefaults.provider,
      model: process.env.AI_MODEL,
      stageModels: Object.fromEntries(
        Object.values(AiStage)
          .map(stage => [stage, process.env['AI_MODEL_' + stage.toUpperCase()]?.trim()] as const)
          .filter(([, model]) => model),
      ),
      agyExecutable: process.env.AGY_EXECUTABLE || AiDefaults.agyExecutable,
      nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || AiDefaults.nvidiaBaseUrl,
      nvidiaEnableThinking:
        process.env.NVIDIA_ENABLE_THINKING !== undefined
          ? process.env.NVIDIA_ENABLE_THINKING !== 'false'
          : AiDefaults.nvidiaEnableThinking,
      callTimeoutMs: Number(process.env.AI_CALL_TIMEOUT_MS || GraphPolicy.callTimeoutMs),
    };
  },
};

export default config;
