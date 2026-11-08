import type { AppConfig } from '../config/index.js';
import { AgyProvider } from './agy-provider.js';
import { NvidiaProvider } from './nvidia-provider.js';
import type { AiProvider } from './ai-provider.js';

export function createDefaultProvider(options: AppConfig['ai']): AiProvider {
  if (options.provider === 'nvidia') {
    return new NvidiaProvider({
      apiKey: options.nvidiaApiKey,
      baseURL: options.nvidiaBaseUrl,
      enableThinking: options.nvidiaEnableThinking,
    });
  }
  return new AgyProvider({ executable: options.agyExecutable });
}
