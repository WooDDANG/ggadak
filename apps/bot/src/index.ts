import 'dotenv/config';
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
