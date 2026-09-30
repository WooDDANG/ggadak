import 'reflect-metadata';
import { GatewayIntentBits, Partials, Message } from 'discord.js';
import { Client } from 'discordx';
import { Decision, createLogger, HarvestingPolicyConfig, DEFAULT_HARVESTING_POLICY } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';
import { HarvesterService } from '../services/harvester.service.js';
import { AnalysisService } from '../services/analysis.service.js';
import { MessageHandler, CONSENSUS_REGEX } from '../handlers/message.handler.js';
import { ReactionHandler } from '../handlers/reaction.handler.js';
import { registerEvents } from '../events/index.js';
import '../commands/feedback.command.js';
import '../commands/scan.command.js';
import '../handlers/conflict.button.js';

export interface BotConfig {
  token?: string;
  backendUrl: string;
  triggerEmoji?: string;
}

const logger = createLogger('BOT');
export { CONSENSUS_REGEX };

export class DecisionTrackerBot {
  public client: Client;
  private backendApi: BackendApiService;
  private analysisService: AnalysisService;
  private messageHandler: MessageHandler;
  private reactionHandler: ReactionHandler;
  private policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY;

  constructor(config: BotConfig) {
    const triggerEmoji = config.triggerEmoji || '📌';
    this.backendApi = new BackendApiService(config.backendUrl);
    const harvester = new HarvesterService();
    this.analysisService = new AnalysisService(this.backendApi, harvester);

    this.messageHandler = new MessageHandler(
      (msg, override) => this.analysisService.executeAnalysis(msg, this.policy, override),
      (msg, emoji) => this.analysisService.addReactionSafely(msg, emoji),
    );

    this.reactionHandler = new ReactionHandler(
      triggerEmoji,
      this.messageHandler,
      (msg, override) => this.analysisService.executeAnalysis(msg, this.policy, override),
      (msg, emoji) => this.analysisService.addReactionSafely(msg, emoji),
    );

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
      silent: false,
    });

    registerEvents({
      client: this.client,
      token: config.token || process.env.DISCORD_BOT_TOKEN,
      messageHandler: this.messageHandler,
      reactionHandler: this.reactionHandler,
      getPolicy: () => this.policy,
    });
  }

  async handleReactionTrigger(message: Message): Promise<Decision[] | null> {
    return this.analysisService.executeAnalysis(message, this.policy, true);
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      logger.warn('DISCORD_BOT_TOKEN is not set. Bot client initialized in offline mode.');
      return;
    }
    this.policy = await this.backendApi.syncPolicy();
    await this.client.login(token);
  }
}
