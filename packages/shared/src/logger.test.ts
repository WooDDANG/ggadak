import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger, formatStagePrefix, getLogDir } from './logger.js';

describe('Shared Logger - Winston Labeling & App-Scoped Log Isolation', () => {
  it('formats stage prefix with designated emoji', () => {
    assert.strictEqual(formatStagePrefix('HARVEST'), '🎣 [HARVEST]');
    assert.strictEqual(formatStagePrefix('TIER1-FILTER'), '🧹 [TIER1-FILTER]');
    assert.strictEqual(formatStagePrefix('DISENTANGLE'), '🌲 [DISENTANGLE]');
    assert.strictEqual(formatStagePrefix('TOPIC-SLICE'), '✂️ [TOPIC-SLICE]');
    assert.strictEqual(formatStagePrefix('3WAY-GATE'), '🚪 [3WAY-GATE]');
    assert.strictEqual(formatStagePrefix('AI-CORE'), '🧠 [AI-CORE]');
    assert.strictEqual(formatStagePrefix('UNKNOWN'), '📌 [UNKNOWN]');
  });

  it('routes bot service logs to apps/bot/logs directory with bot.log and error.log', async () => {
    const logger = createLogger('BOT-MESSAGE-HANDLER');
    const logDir = getLogDir('BOT-MESSAGE-HANDLER');
    assert.ok(logDir.endsWith(path.join('apps', 'bot', 'logs')), `Expected apps/bot/logs, got ${logDir}`);

    logger.info('Test bot message harvested', {
      traceId: 'trc-bot-1234',
      stage: 'HARVEST',
      rawCount: 5,
    });
    logger.error('Test bot unexpected error occurred', {
      traceId: 'trc-bot-err-1',
    });

    await new Promise(resolve => setTimeout(resolve, 80));

    const botLogPath = path.join(logDir, 'bot.log');
    const errorLogPath = path.join(logDir, 'error.log');

    assert.ok(fs.existsSync(botLogPath), 'apps/bot/logs/bot.log must exist');
    assert.ok(fs.existsSync(errorLogPath), 'apps/bot/logs/error.log must exist');

    const botContent = fs.readFileSync(botLogPath, 'utf-8');
    const errContent = fs.readFileSync(errorLogPath, 'utf-8');

    // Verify official Winston label and content
    assert.ok(botContent.includes('[BOT-MESSAGE-HANDLER]'), 'bot.log should include label [BOT-MESSAGE-HANDLER]');
    assert.ok(botContent.includes('trc-bot-1234'), 'bot.log should contain traceId');
    assert.ok(errContent.includes('Test bot unexpected error occurred'), 'error.log should record error');
  });

  it('routes backend service logs to apps/be/logs directory with be.log and preprocessing.log', async () => {
    const logger = createLogger('BE-EXTRACTOR-CORE');
    const logDir = getLogDir('BE-EXTRACTOR-CORE');
    assert.ok(logDir.endsWith(path.join('apps', 'be', 'logs')), `Expected apps/be/logs, got ${logDir}`);

    logger.info('Test preprocessing event from BE', {
      stage: 'TIER1-FILTER',
      traceId: 'trc-be-5678',
      durationMs: 3.2,
      cleanCount: 12,
    });

    await new Promise(resolve => setTimeout(resolve, 80));

    const beLogPath = path.join(logDir, 'be.log');
    const prepLogPath = path.join(logDir, 'preprocessing.log');

    assert.ok(fs.existsSync(beLogPath), 'apps/be/logs/be.log must exist');
    assert.ok(fs.existsSync(prepLogPath), 'apps/be/logs/preprocessing.log must exist');

    const beContent = fs.readFileSync(beLogPath, 'utf-8');
    const prepContent = fs.readFileSync(prepLogPath, 'utf-8');

    assert.ok(beContent.includes('[BE-EXTRACTOR-CORE]'), 'be.log should include label [BE-EXTRACTOR-CORE]');
    assert.ok(prepContent.includes('TIER1-FILTER'), 'preprocessing.log should include stage TIER1-FILTER');
    assert.ok(prepContent.includes('trc-be-5678'), 'preprocessing.log should include traceId');
  });
});
