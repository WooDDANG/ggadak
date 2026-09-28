import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Search for .env in current dir, package root, and monorepo root
const potentialEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

for (const envPath of potentialEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

import { DecisionTrackerBot } from './bot/client.js';

const WEBHOOK_URL = process.env.BE_WEBHOOK_URL || 'http://localhost:3001/api/webhooks/decisions';
const TRIGGER_EMOJI = process.env.TRIGGER_EMOJI || '📌';

const bot = new DecisionTrackerBot({
  webhookUrl: WEBHOOK_URL,
  triggerEmoji: TRIGGER_EMOJI
});

bot.start().catch(err => {
  console.error('[Bot] Failed to start Discord bot daemon:', err);
});
