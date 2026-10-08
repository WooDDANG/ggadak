import winston from 'winston';
import path from 'node:path';
import fs from 'node:fs';

const STAGE_EMOJIS: Record<string, string> = {
  HARVEST: '🎣',
  DEBOUNCE: '⏳',
  LOCK: '🔒',
  'TIER1-FILTER': '🧹',
  DISENTANGLE: '🌲',
  'TOPIC-SLICE': '✂️',
  '3WAY-GATE': '🚪',
  'AI-CORE': '🧠',
  GOVERNANCE: '⚖️',
  REVIEW: '📋',
};

export function formatStagePrefix(stage?: string): string {
  if (!stage) return '';
  const key = stage.toUpperCase();
  const emoji = STAGE_EMOJIS[key] || '📌';
  return `${emoji} [${key}]`;
}

export function getLogDir(): string {
  // Check if we are inside monorepo package or at root
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'packages')) && fs.existsSync(path.join(dir, 'apps'))) {
      const target = path.join(dir, 'logs');
      if (!fs.existsSync(target)) {
        try { fs.mkdirSync(target, { recursive: true }); } catch {}
      }
      return target;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fallback = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(fallback)) {
    try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
  }
  return fallback;
}

export function createLogger(serviceName: string): winston.Logger {
  const logDir = getLogDir();

  // Visual Pretty Console Format for Terminal
  const consoleFormat = winston.format.printf(({ timestamp, level, message, stack, stage, traceId, durationMs, ...meta }) => {
    const stagePrefix = stage ? ` ${formatStagePrefix(String(stage))}` : '';
    const tracePrefix = traceId ? ` [${String(traceId).slice(0, 8)}]` : '';
    const durationSuffix = durationMs !== undefined ? ` (+${durationMs}ms)` : '';
    const metaKeys = Object.keys(meta);
    const metaStr = metaKeys.length ? ` ${JSON.stringify(meta)}` : '';
    const logMessage = stack || message;

    return `[${timestamp}] [${serviceName.toUpperCase()}] [${level.toUpperCase()}]${tracePrefix}${stagePrefix}: ${logMessage}${durationSuffix}${metaStr}`;
  });

  // Standard File Log Format
  const fileFormat = winston.format.printf(({ timestamp, level, message, stack, stage, traceId, durationMs, ...meta }) => {
    const metaPayload = {
      service: serviceName,
      traceId,
      stage,
      durationMs,
      ...meta,
    };
    const logMessage = stack || message;
    return `[${timestamp}] [${level.toUpperCase()}] [${serviceName}]: ${logMessage} ${JSON.stringify(metaPayload)}`;
  });

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        consoleFormat,
      ),
    }),
  ];

  if (fs.existsSync(logDir)) {
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          fileFormat,
        ),
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          fileFormat,
        ),
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'preprocessing.log'),
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          fileFormat,
        ),
      }),
    );
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports,
  });
}
