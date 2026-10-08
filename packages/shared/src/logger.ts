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

export interface LoggerOptions {
  appDir?: string;
}

/**
 * Finds the monorepo root directory containing 'packages' and 'apps'.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'packages')) && fs.existsSync(path.join(dir, 'apps'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Resolves the app-scoped log directory.
 * If serviceName belongs to bot -> apps/bot/logs
 * If serviceName belongs to backend -> apps/be/logs
 * Otherwise defaults to repoRoot/logs
 */
export function getLogDir(serviceName?: string, options?: LoggerOptions): string {
  if (options?.appDir) {
    const target = path.join(options.appDir, 'logs');
    if (!fs.existsSync(target)) {
      try { fs.mkdirSync(target, { recursive: true }); } catch {}
    }
    return target;
  }

  const repoRoot = findRepoRoot();
  const sName = (serviceName || '').toUpperCase();

  const isBotService =
    sName.startsWith('BOT') ||
    sName.includes('HARVEST') ||
    sName.includes('FEEDBACK-CMD') ||
    sName.includes('SCAN-CMD') ||
    sName.includes('GUILD-CREATE') ||
    sName.includes('EVENT-LOADER') ||
    sName.includes('INTERACTION-EVENT') ||
    sName.includes('READY-EVENT') ||
    sName.includes('CONFLICT-BUTTON');

  const isBeService =
    sName.startsWith('BE') ||
    sName.includes('AI-ADAPTER') ||
    sName.includes('AI-EXTRACTOR') ||
    sName.includes('DECISION-CONTROLLER') ||
    sName.includes('ERROR-HANDLER') ||
    sName.includes('EXPRESS-LOADER');

  let targetDir: string;
  if (isBotService) {
    targetDir = path.join(repoRoot, 'apps', 'bot', 'logs');
  } else if (isBeService) {
    targetDir = path.join(repoRoot, 'apps', 'be', 'logs');
  } else {
    targetDir = path.join(repoRoot, 'logs');
  }

  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
  }
  return targetDir;
}

export function createLogger(serviceName: string, options?: LoggerOptions): winston.Logger {
  const logDir = getLogDir(serviceName, options);
  const sName = serviceName.toUpperCase();
  const isBotService =
    sName.startsWith('BOT') ||
    sName.includes('HARVEST') ||
    sName.includes('FEEDBACK-CMD') ||
    sName.includes('SCAN-CMD') ||
    sName.includes('GUILD-CREATE') ||
    sName.includes('EVENT-LOADER') ||
    sName.includes('INTERACTION-EVENT') ||
    sName.includes('READY-EVENT') ||
    sName.includes('CONFLICT-BUTTON');

  // Visual Pretty Console Format for Terminal
  const consoleFormat = winston.format.printf(({ timestamp, level, message, label, stack, stage, traceId, durationMs, ...meta }) => {
    const tagLabel = label || sName;
    const stagePrefix = stage ? ` ${formatStagePrefix(String(stage))}` : '';
    const tracePrefix = traceId ? ` [${String(traceId).slice(0, 8)}]` : '';
    const durationSuffix = durationMs !== undefined ? ` (+${durationMs}ms)` : '';
    const metaKeys = Object.keys(meta);
    const metaStr = metaKeys.length ? ` ${JSON.stringify(meta)}` : '';
    const logMessage = stack || message;

    return `[${timestamp}] [${tagLabel}] [${level.toUpperCase()}]${tracePrefix}${stagePrefix}: ${logMessage}${durationSuffix}${metaStr}`;
  });

  // Standard File Log Format
  const fileFormat = winston.format.printf(({ timestamp, level, message, label, stack, stage, traceId, durationMs, ...meta }) => {
    const tagLabel = label || sName;
    const metaPayload = {
      service: tagLabel,
      traceId,
      stage,
      durationMs,
      ...meta,
    };
    const logMessage = stack || message;
    return `[${timestamp}] [${level.toUpperCase()}] [${tagLabel}]: ${logMessage} ${JSON.stringify(metaPayload)}`;
  });

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.label({ label: sName }),
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        consoleFormat,
      ),
    }),
  ];

  if (fs.existsSync(logDir)) {
    // 1. Common Error log
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.label({ label: sName }),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          fileFormat,
        ),
      }),
    );

    // 2. App-specific file transports
    if (isBotService) {
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'bot.log'),
          format: winston.format.combine(
            winston.format.label({ label: sName }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            fileFormat,
          ),
        }),
      );
    } else {
      // Backend or shared
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'be.log'),
          format: winston.format.combine(
            winston.format.label({ label: sName }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            fileFormat,
          ),
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'preprocessing.log'),
          format: winston.format.combine(
            winston.format.label({ label: sName }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            fileFormat,
          ),
        }),
      );
    }
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports,
  });
}
