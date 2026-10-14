import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const { DecisionTrackerBot } = await import('./bot/client.js');

const BACKEND_URL = process.env.BE_URL || 'http://localhost:3001';
const TRIGGER_EMOJI = process.env.TRIGGER_EMOJI || '📌';

const bot = new DecisionTrackerBot({
  backendUrl: BACKEND_URL,
  triggerEmoji: TRIGGER_EMOJI,
});

bot.start().catch(err => {
  console.error('[Bot] Failed to start Discord bot daemon:', err);
});
