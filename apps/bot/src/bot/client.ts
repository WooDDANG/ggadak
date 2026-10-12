import 'reflect-metadata';
import { GatewayIntentBits, Partials, Message, Events } from 'discord.js';
import { Client } from 'discordx';
import {
  Decision,
  createLogger,
  HarvestingPolicyConfig,
  DEFAULT_HARVESTING_POLICY,
} from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';
import { DiscussionHarvester } from '../services/harvester.service.js';
import { DecisionHarvestingEngine } from '../services/decision-harvesting-engine.js';
import { MessageHandler, CONSENSUS_REGEX } from '../handlers/message.handler.js';
import { ReactionHandler } from '../handlers/reaction.handler.js';
import { registerEvents } from '../events/index.js';
import '../commands/feedback.command.js';
import '../commands/scan.command.js';

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
  private analysisService: DiscussionHarvester;
  private engine: DecisionHarvestingEngine;
  private messageHandler: MessageHandler;
  private reactionHandler: ReactionHandler;
  private policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY;

  constructor(config: BotConfig) {
    const triggerEmoji = config.triggerEmoji || '📌';
    this.backendApi = new BackendApiService(config.backendUrl);
    this.analysisService = new DiscussionHarvester(this.backendApi);
    this.engine = new DecisionHarvestingEngine(this.backendApi, this.analysisService);

    this.messageHandler = new MessageHandler(
      this.engine,
      (msg: Message, emoji: string) => this.analysisService.addReactionSafely(msg, emoji),
      (guildId, channelId) => this.backendApi.isMonitoredChannel(guildId, channelId),
    );

    this.reactionHandler = new ReactionHandler(
      triggerEmoji,
      this.engine,
      (msg: Message, emoji: string) => this.analysisService.addReactionSafely(msg, emoji),
      (guildId, channelId) => this.backendApi.isMonitoredChannel(guildId, channelId),
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

    this.client.once(Events.ClientReady, () => {
      let syncWorkerBusy = false;
      const processSyncJob = async () => {
        if (syncWorkerBusy) return;
        syncWorkerBusy = true;
        try {
          const job = await this.backendApi.claimSyncJob();
          if (!job) return;
          let completedChannels = job.completedChannels ?? 0;
          let failedChannels = job.failedChannels ?? 0;
          let decisionsFound = job.decisionsFound ?? 0;
          let messagesScanned = job.messagesScanned ?? 0;
          for (const channelId of job.channelIds as string[]) {
            try {
              const channel = await this.client.channels.fetch(channelId);
              if (!channel || !channel.isTextBased() || channel.isThread() || !('guild' in channel))
                throw new Error('Monitored text channel is inaccessible');
              const result = await this.analysisService.scanChannel(channel as any, this.policy, {
                full: Boolean(job.forceFullSync),
                forceFullSync: Boolean(job.forceFullSync),
                requestId: job.forceFullSync ? `sync-${job.jobId}-${channelId}` : undefined,
              });
              completedChannels++;
              messagesScanned += result.scannedCount;
              decisionsFound += result.decisionsCount;
            } catch (error: any) {
              failedChannels++;
              logger.warn(`[Sync Job ${job.jobId}] Channel ${channelId} failed: ${error.message}`);
            }
            await this.backendApi.updateSyncJob(job.jobId, {
              completedChannels,
              failedChannels,
              decisionsFound,
              messagesScanned,
              status: 'PROCESSING',
            });
          }
          await this.backendApi.updateSyncJob(job.jobId, {
            completedChannels,
            failedChannels,
            decisionsFound,
            messagesScanned,
            status: failedChannels ? 'FAILED' : 'COMPLETED',
            errorMessage: failedChannels
              ? `${failedChannels} channel scan(s) failed; failed ranges remain available for retry.`
              : null,
          });
        } catch (error: any) {
          logger.warn(`Sync Job worker unavailable: ${error.message}`);
        } finally {
          syncWorkerBusy = false;
        }
      };
      void processSyncJob();
      const syncTimer = setInterval(() => {
        void processSyncJob();
      }, 5_000);
      syncTimer.unref();

      let recovering = false;
      const recover = async () => {
        if (recovering) return;
        recovering = true;
        try {
          for (const { payload, result } of await this.backendApi.retryPendingAnalyses(1)) {
            if (!payload.channelId || !payload.triggerMessageId) continue;
            try {
              const channel = await this.client.channels.fetch(payload.channelId);
              if (!channel || !channel.isTextBased() || !('messages' in channel)) continue;
              const message = await channel.messages.fetch(payload.triggerMessageId);
              await this.analysisService.removeReactionSafely(message, '👀');
              await this.analysisService.removeReactionSafely(message, '⚠️');
              if (result.found && result.decisions.length)
                await this.analysisService.addReactionSafely(message, '📝');
            } catch (error: any) {
              logger.warn(
                `Recovered analysis but could not update Discord reaction: ${error.message}`,
              );
            }
          }
        } catch (error: any) {
          logger.warn(`Analysis recovery unavailable: ${error.message}`);
        } finally {
          recovering = false;
        }
      };
      void recover();
      const retryTimer = setInterval(() => {
        void recover();
      }, 60_000);
      retryTimer.unref();
    });

    registerEvents({
      client: this.client,
      token: config.token || process.env.DISCORD_BOT_TOKEN,
      analysisService: this.analysisService,
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
