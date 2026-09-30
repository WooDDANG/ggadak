import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  TextChannel,
} from 'discord.js';
import {
  Decision,
  createLogger,
  HarvestingPolicyConfig,
  DEFAULT_HARVESTING_POLICY,
} from '@ggaddak/shared';
import { BotEmbedView } from '../views/embed.view.js';
import { BackendApiService } from '../services/backend-api.service.js';
import { HarvesterService } from '../services/harvester.service.js';
import { MessageHandler, CONSENSUS_REGEX } from '../handlers/message.handler.js';
import { ReactionHandler } from '../handlers/reaction.handler.js';
import { InteractionHandler } from '../handlers/interaction.handler.js';

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
  private harvesterService: HarvesterService;
  private messageHandler: MessageHandler;
  private reactionHandler: ReactionHandler;
  private interactionHandler: InteractionHandler;

  private triggerEmoji: string;
  private policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY;
  private inFlightChannels = new Set<string>();

  constructor(config: BotConfig) {
    this.triggerEmoji = config.triggerEmoji || '📌';
    this.backendApi = new BackendApiService(config.backendUrl);
    this.harvesterService = new HarvesterService();

    this.messageHandler = new MessageHandler(
      (msg, override) => this.executeAnalysis(msg, override),
      (msg, emoji) => this.addReactionSafely(msg, emoji),
    );

    this.reactionHandler = new ReactionHandler(
      this.triggerEmoji,
      this.messageHandler,
      (msg, override) => this.executeAnalysis(msg, override),
      (msg, emoji) => this.addReactionSafely(msg, emoji),
    );

    this.interactionHandler = new InteractionHandler(
      this.backendApi,
      limit => this.scanAllChannels(limit),
    );

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });

    this.setupListeners();
  }

  private async syncPolicyFromBackend(): Promise<void> {
    this.policy = await this.backendApi.syncPolicy();
  }

  private setupListeners() {
    this.client.on('ready', async () => {
      logger.info(
        `Discord Gateway connected! Logged in as ${this.client.user?.tag} (ID: ${this.client.user?.id})`,
      );
      logger.info(`Backend AI API target: ${this.backendApi.baseUrl}`);

      await this.syncPolicyFromBackend();
      logger.info(
        `Autonomous monitoring enabled (Keywords, Reactions >= ${this.policy.reactionThreshold}, and '${this.triggerEmoji}' Override)`,
      );

      // Initial channel scan across uninitialized channels
      try {
        await this.scanAllChannels(this.policy.initialScanLimit);
      } catch (err: any) {
        logger.error(`[Initial Scan] Error during startup scan: ${err.message}`, {
          stack: err.stack,
        });
      }
    });

    // 1. Passive Stream Monitoring: messageCreate
    this.client.on('messageCreate', async message => {
      await this.messageHandler.handleMessage(message, this.policy);
    });

    // 2. Passive Stream Monitoring: messageReactionAdd
    this.client.on('messageReactionAdd', async (reaction, user) => {
      await this.reactionHandler.handleReactionAdd(reaction, user, this.policy);
    });

    // 3. Global Interaction Listener (Buttons & Slash Commands)
    this.client.on('interactionCreate', async interaction => {
      if (interaction.isButton()) {
        await this.interactionHandler.handleButton(interaction);
      } else if (interaction.isChatInputCommand()) {
        await this.interactionHandler.handleSlashCommand(interaction, this.policy);
      }
    });
  }

  async addReactionSafely(message: Message, emoji: string): Promise<void> {
    try {
      await message.react(emoji);
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to add '${emoji}' reaction: ${err.message}`);
    }
  }

  async removeReactionSafely(message: Message, emoji: string): Promise<void> {
    try {
      const botId = this.client.user?.id;
      const existing = message.reactions.cache.find(r => r.emoji.name === emoji);
      if (existing && botId) {
        await existing.users.remove(botId);
      }
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to remove '${emoji}' reaction: ${err.message}`);
    }
  }

  async scanAllChannels(limit: number = 50): Promise<void> {
    logger.info(`[Initial Scan] Performing scan across guilds with limit=${limit}...`);
    for (const guild of this.client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased() || channel.isThread()) continue;

        try {
          const textChannel = channel as TextChannel;
          const lastCheckpoint = await this.backendApi.getCheckpoint(channel.id);

          const fetchOptions: { limit: number; after?: string } = { limit };
          if (lastCheckpoint) {
            fetchOptions.after = lastCheckpoint;
          }

          const messages = await textChannel.messages.fetch(fetchOptions);
          if (messages.size === 0) continue;

          logger.info(
            `[Initial Scan] Found ${messages.size} unanalyzed messages in #${channel.name}`,
          );

          const sorted = Array.from(messages.values()).sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp,
          );
          const newestMessage = sorted[sorted.length - 1];

          for (const msg of sorted) {
            if (CONSENSUS_REGEX.test(msg.content)) {
              await this.executeAnalysis(msg, true);
              break;
            }
          }

          await this.backendApi.saveCheckpoint(channel.id, newestMessage.id);
        } catch (err: any) {
          logger.warn(`[Initial Scan] Skipping channel #${channel.name}: ${err.message}`);
        }
      }
    }
  }

  // Backward-compatible alias
  async handleReactionTrigger(message: Message, _triggeredBy?: string): Promise<Decision[] | null> {
    return this.executeAnalysis(message, true);
  }

  async executeAnalysis(
    message: Message,
    isManualOverride: boolean = false,
  ): Promise<Decision[] | null> {
    const channel = message.channel;
    if (!channel.isTextBased()) return null;

    const channelId = channel.id;
    if (this.inFlightChannels.has(channelId) && !isManualOverride) {
      logger.info(`[Lock] Channel #${channelId} is already in-flight. Skipping duplicate trigger.`);
      return null;
    }

    this.inFlightChannels.add(channelId);
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    try {
      const rawMessages = await this.harvesterService.harvestContextMessages(message, this.policy);

      logger.info(
        `[Context] Harvested ${rawMessages.length} messages for #${channelName}. Sending to Backend AI...`,
      );

      const result = await this.backendApi.analyzeDiscussion({
        rawMessages: rawMessages.map(m => ({
          id: m.id,
          author: m.authorName,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          replyingTo: m.referenceMessageId,
        })),
        guildId: message.guildId || undefined,
        channelId: message.channelId,
        channelName,
        triggerMessageId: message.id,
        messageUrl: message.url,
      });

      if (!result.found || !result.decisions || result.decisions.length === 0) {
        logger.info(
          `[Analyze] No new decision candidate found in #${channelName}. (${result.summary})`,
        );
        await this.removeReactionSafely(message, '👀');
        return null;
      }

      await this.removeReactionSafely(message, '👀');
      await this.addReactionSafely(message, '📝');

      // Post Draft candidate embeds
      if ('send' in channel && typeof (channel as any).send === 'function') {
        const sendableChannel = channel as { send: (options: any) => Promise<any> };
        for (const dec of result.decisions as Decision[]) {
          const embed = BotEmbedView.renderCandidateEmbed(dec, rawMessages.length);
          await sendableChannel.send({ embeds: [embed] });
        }

        // Check conflict / pivot prompt
        if (result.hasConflict && result.conflictingDecision && result.decisions.length > 0) {
          const newDec = result.decisions[0];
          const oldDec = result.conflictingDecision;
          const conflictEmbed = BotEmbedView.renderConflictEmbed(newDec, oldDec);
          const actionRow = BotEmbedView.renderConflictActionRow(newDec.id, oldDec.id);
          await sendableChannel.send({ embeds: [conflictEmbed], components: [actionRow] });
        }
      }

      return result.decisions;
    } catch (err: any) {
      logger.error(`[Execution] Error during analysis: ${err.message}`, { stack: err.stack });
      await this.removeReactionSafely(message, '👀');
      return null;
    } finally {
      this.inFlightChannels.delete(channelId);
    }
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      logger.warn('DISCORD_BOT_TOKEN is not set. Bot client initialized in offline mode.');
      return;
    }
    await this.client.login(token);
  }
}
