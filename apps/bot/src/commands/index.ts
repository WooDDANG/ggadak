import { Collection } from 'discord.js';
import { feedbackCommand } from './feedback.command.js';
import { scanCommand } from './scan.command.js';

export interface BotCommand {
  data: any;
  execute: (...args: any[]) => Promise<void>;
}

export function registerCommands(): Collection<string, BotCommand> {
  const commands = new Collection<string, BotCommand>();
  commands.set(feedbackCommand.data.name, feedbackCommand);
  commands.set(scanCommand.data.name, scanCommand);
  return commands;
}

export const commandDefinitions = [
  feedbackCommand.data.toJSON(),
  scanCommand.data.toJSON(),
];
