import { createLogger } from '@ggaddak/shared';

export function createWinstonLogger(serviceName = 'BE') {
  return createLogger(serviceName);
}

export const appLogger = createLogger('BE');
export default appLogger;
