import { backendUrl as getBackendUrl, BotPolicy } from './config.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const { DecisionTrackerBot } = await import('./bot/client.js');

const BACKEND_URL = getBackendUrl();
const TRIGGER_EMOJI = process.env.TRIGGER_EMOJI || BotPolicy.triggerEmoji;

if (process.env.NODE_ENV === 'production' && !process.env.DISCORD_BOT_TOKEN) {
  console.error('[Bot] DISCORD_BOT_TOKEN is required in production');
  process.exit(1);
}

const bot = new DecisionTrackerBot({
  backendUrl: BACKEND_URL,
  triggerEmoji: TRIGGER_EMOJI,
});

bot.start().catch(err => {
  console.error('[Bot] Failed to start Discord bot daemon:', err);
  process.exit(1);
});
