import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  ButtonInteraction
} from 'discord.js';
import { Decision, createLogger } from '@ggaddak/shared';
import { RawMessageData } from '../context/builder.js';

export interface BotConfig {
  token?: string;
  backendUrl: string;
  triggerEmoji?: string;
}

const logger = createLogger('BOT');

export const CONSENSUS_REGEX = /(~?합시다|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?진행할게요|~?완료|픽스|fix|agree)/i;
export const REACTION_THRESHOLD = 3;
export const DEBOUNCE_MS = 15000;

export class DecisionTrackerBot {
  public client: Client;
  private backendUrl: string;
  private triggerEmoji: string;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private inFlightChannels = new Set<string>();

  constructor(config: BotConfig) {
    this.backendUrl = config.backendUrl.replace(/\/+$/, '');
    this.triggerEmoji = config.triggerEmoji || '📌';

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.client.on('ready', async () => {
      logger.info(`Discord Gateway connected! Logged in as ${this.client.user?.tag} (ID: ${this.client.user?.id})`);
      logger.info(`Backend AI API target: ${this.backendUrl}`);
      logger.info(`Autonomous monitoring enabled (Keywords, Reactions >= ${REACTION_THRESHOLD}, and '${this.triggerEmoji}' Override)`);

      // Execute Initial Channel Backfill Scan for all joined channels
      try {
        await this.scanAllChannels(50);
      } catch (err: any) {
        logger.error(`[Initial Scan] Error during startup scan: ${err.message}`, { stack: err.stack });
      }
    });

    // 1. Passive Stream Monitoring: messageCreate (Keyword Trigger Detection)
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      if (CONSENSUS_REGEX.test(message.content)) {
        logger.info(`[Trigger] Consensus keyword matched in #${('name' in message.channel ? message.channel.name : message.channelId)}: "${message.content.slice(0, 30)}..."`);
        await this.addReactionSafely(message, '👀');
        this.enqueueChannelTrigger(message, false);
      }
    });

    // 2. Passive Stream Monitoring: messageReactionAdd (Reaction Threshold & Manual 📌 Override)
    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;

      (async () => {
        try {
          if (reaction.partial) await reaction.fetch();
          if (reaction.message.partial) await reaction.message.fetch();

          const message = reaction.message as Message;
          const isManualOverride = reaction.emoji.name === this.triggerEmoji;

          if (isManualOverride) {
            logger.info(`[Override] Manual trigger '${this.triggerEmoji}' added by @${user.username} on msg ${message.id}`);
            await this.addReactionSafely(message, '👀');
            await this.executeAnalysis(message, true);
            return;
          }

          // Count total reactions across all emojis on this message
          const totalReactions = message.reactions.cache.reduce((sum, r) => sum + r.count, 0);
          if (totalReactions >= REACTION_THRESHOLD) {
            logger.info(`[Trigger] Reaction threshold (${totalReactions} >= ${REACTION_THRESHOLD}) reached on msg ${message.id}`);
            await this.addReactionSafely(message, '👀');
            this.enqueueChannelTrigger(message, false);
          }
        } catch (err: any) {
          logger.error(`[Reaction] Error handling reaction add: ${err.message}`, { stack: err.stack });
        }
      })();
    });

    // 3. Global Non-blocking Button Interaction Listener (Eliminates 3-second timeout)
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const customId = interaction.customId;
      if (customId.startsWith('conflict:')) {
        await this.handleConflictButtonInteraction(interaction);
      }
    });
  }

  private enqueueChannelTrigger(message: Message, isManualOverride: boolean) {
    const channelId = message.channelId;

    if (isManualOverride) {
      const existing = this.debounceTimers.get(channelId);
      if (existing) {
        clearTimeout(existing);
        this.debounceTimers.delete(channelId);
      }
      this.executeAnalysis(message, true);
      return;
    }

    if (this.debounceTimers.has(channelId)) {
      clearTimeout(this.debounceTimers.get(channelId)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(channelId);
      await this.executeAnalysis(message, false);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(channelId, timer);
    logger.info(`[Debounce] Scheduled analysis for #${channelId} in ${DEBOUNCE_MS / 1000}s`);
  }

  private async addReactionSafely(message: Message, emoji: string) {
    try {
      await message.react(emoji);
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to add '${emoji}' reaction: ${err.message}`);
    }
  }

  private async removeReactionSafely(message: Message, emoji: string) {
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

  private async handleConflictButtonInteraction(interaction: ButtonInteraction) {
    try {
      await interaction.deferUpdate();
    } catch (err: any) {
      logger.warn(`[Interaction] Failed to defer update: ${err.message}`);
      return;
    }

    const [, resolution, newDecisionId, conflictingId] = interaction.customId.split(':');
    logger.info(`[Interaction] Button clicked by @${interaction.user.username}: resolution=${resolution}, new=${newDecisionId}, conflicting=${conflictingId}`);

    try {
      const res = await fetch(`${this.backendUrl}/api/decisions/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionId: newDecisionId,
          conflictingId: conflictingId,
          resolution
        })
      });

      if (!res.ok) {
        throw new Error(`Backend returned status ${res.status}`);
      }

      const isSupersede = resolution === 'supersede';
      const embed = new EmbedBuilder()
        .setTitle(isSupersede ? '✅ 기존 결정 대체 완료 (Superseded)' : '✅ 독립 결정으로 보존 완료')
        .setDescription(
          isSupersede
            ? `기존 결정 **[${conflictingId}]**을 대체하고 새 결정 **[${newDecisionId}]**으로 확정했습니다.`
            : `기존 결정 **[${conflictingId}]**과 새 결정 **[${newDecisionId}]**을 모두 독립적으로 유지합니다.`
        )
        .setColor(isSupersede ? 0x10b981 : 0x3b82f6)
        .setFooter({ text: `처리 완료 (@${interaction.user.username}) | ID: ${newDecisionId}` });

      await interaction.editReply({
        embeds: [embed],
        components: []
      });

      logger.info(`[Interaction] Successfully finalized conflict resolution on Discord`);
    } catch (err: any) {
      logger.error(`[Interaction] Failed to process conflict resolution: ${err.message}`, { stack: err.stack });
      try {
        await interaction.editReply({
          content: '⚠️ 충돌 해결 처리 중 오류가 발생했습니다. 백엔드 연결 상태를 확인해주세요.',
          components: []
        });
      } catch {}
    }
  }

  async executeAnalysis(message: Message, isManualOverride: boolean = false): Promise<Decision[] | null> {
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
      // 1. Fetch channel checkpoint from Backend
      let lastMessageId: string | null = null;
      try {
        const cpRes = await fetch(`${this.backendUrl}/api/channels/${channelId}/checkpoint`);
        if (cpRes.ok) {
          const cpData = await cpRes.json() as any;
          lastMessageId = cpData.lastMessageId || null;
        }
      } catch (err: any) {
        logger.warn(`[Checkpoint] Failed to fetch checkpoint for #${channelId}: ${err.message}`);
      }

      // 2. Fetch context window
      let rawMessages: RawMessageData[] = [];
      if (lastMessageId) {
        const fetchedAfter = await channel.messages.fetch({ limit: 50, after: lastMessageId });
        const msgs = Array.from(fetchedAfter.values()).reverse();
        rawMessages = msgs.map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId
        }));
      }

      // Fallback or Initial scan
      if (rawMessages.length < 2) {
        const fetchedBefore = await channel.messages.fetch({ limit: 30, before: message.id });
        const beforeMsgs = Array.from(fetchedBefore.values()).reverse().map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId
        }));

        rawMessages = [
          ...beforeMsgs,
          {
            id: message.id,
            authorId: message.author.id,
            authorName: message.author.username,
            content: message.content,
            createdAt: message.createdAt
          }
        ];
      }

      logger.info(`[Context] Harvested ${rawMessages.length} messages for #${channelName}. Sending to Backend AI...`);

      // 3. Delegate analysis to Backend AI Core
      const res = await fetch(`${this.backendUrl}/api/discussions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMessages: rawMessages.map(m => ({
            author: m.authorName,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            replyingTo: m.referenceAuthorName
          })),
          guildId: message.guildId || 'dm',
          channelId: message.channelId,
          channelName: channelName,
          triggerMessageId: message.id,
          messageUrl: message.url
        })
      });

      if (!res.ok) {
        logger.error(`[Backend] Analysis request failed with status: ${res.status}`);
        await this.removeReactionSafely(message, '👀');
        return null;
      }

      const result = await res.json() as any;

      if (!result.found || !result.decisions || result.decisions.length === 0) {
        logger.info(`[Backend] No decision consensus identified in #${channelName}`);
        await this.removeReactionSafely(message, '👀');
        if (isManualOverride && 'send' in channel) {
          await channel.send('💡 이 대화 맥락에서 명확한 의사결정 사항을 발견하지 못했습니다.');
        }
        return null;
      }

      logger.info(`[Backend] Extracted ${result.decisions.length} decisions! Updating Reaction Feedback (📝)...`);

      // Update reaction feedback
      await this.removeReactionSafely(message, '👀');
      await this.addReactionSafely(message, '📝');

      // 4. Handle conflict or render decision embeds
      if (result.hasConflict && result.conflictingDecision && 'send' in channel) {
        const primaryDecision = result.decisions[0];
        await this.sendConflictPrompt(channel as any, primaryDecision, result.conflictingDecision);
      } else if ('send' in channel) {
        for (const decision of result.decisions) {
          const actionItemsText = decision.actionItems && decision.actionItems.length > 0
            ? `\n\n**📋 후속 조치:**\n` + decision.actionItems.map((a: any) => `• ${a.task} ${a.assignee ? `(@${a.assignee})` : ''}`).join('\n')
            : '';

          const embed = new EmbedBuilder()
            .setTitle(`📝 의사결정 기록 완료: [${decision.topic}]`)
            .setDescription(`**🎯 결정:** ${decision.decision}\n**💡 근거:** ${decision.rationale}${actionItemsText}`)
            .setFooter({ text: `ID: ${decision.id} | 상태: ${decision.state}` })
            .setColor(0x10b981);

          await channel.send({ embeds: [embed] });
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

  // Backward-compatible alias
  async handleReactionTrigger(message: Message, triggeredBy?: string): Promise<Decision[] | null> {
    return this.executeAnalysis(message, true);
  }

  private async sendConflictPrompt(
    channel: { send: Function },
    newDecision: Decision,
    oldDecision: Decision
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ 의사결정 충돌/변경 감지')
      .setDescription(
        `기존 결정 **[${oldDecision.id}]**과 유사한 새 결정이 추출되었습니다.\n\n` +
        `**[기존 결정]**: ${oldDecision.decision}\n` +
        `**[새로운 결정]**: ${newDecision.decision}\n\n` +
        `어떻게 처리할까요?`
      )
      .setColor(0xf59e0b)
      .setFooter({ text: `선택 시 즉시 상태가 반영됩니다.` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`conflict:supersede:${newDecision.id}:${oldDecision.id}`)
        .setLabel('기존 결정 대체 (Supersede)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`conflict:independent:${newDecision.id}:${oldDecision.id}`)
        .setLabel('독립 결정으로 유지')
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    logger.info(`[Conflict] Sent conflict prompt for [${newDecision.id}] vs [${oldDecision.id}] in channel`);
  }

  async scanAllChannels(limit: number = 50): Promise<void> {
    logger.info(`[Initial Scan] Beginning initial channel scan across all guilds (limit=${limit})...`);

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const channels = await guild.channels.fetch();
        for (const channel of channels.values()) {
          if (!channel || !channel.isTextBased()) continue;

          const channelId = channel.id;
          const channelName = channel.name || channelId;

          try {
            // Check if checkpoint already exists
            const cpRes = await fetch(`${this.backendUrl}/api/channels/${channelId}/checkpoint`);
            if (cpRes.ok) {
              const cpData = await cpRes.json() as any;
              if (cpData.lastMessageId) {
                logger.info(`[Initial Scan] Channel #${channelName} already has checkpoint [${cpData.lastMessageId}]. Skipping initial backfill.`);
                continue;
              }
            }

            logger.info(`[Initial Scan] Scanning uninitialized channel #${channelName}...`);
            const fetched = await channel.messages.fetch({ limit });
            if (fetched.size === 0) {
              continue;
            }

            const msgs = Array.from(fetched.values()).reverse();
            const newestMsg = msgs[msgs.length - 1];

            const rawMessages = msgs.map(m => ({
              author: m.author.username,
              content: m.content,
              createdAt: m.createdAt.toISOString(),
              replyingTo: m.reference?.messageId
            }));

            const res = await fetch(`${this.backendUrl}/api/discussions/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rawMessages,
                guildId: guild.id,
                channelId: channel.id,
                channelName: channelName,
                triggerMessageId: newestMsg.id,
                messageUrl: newestMsg.url
              })
            });

            if (res.ok) {
              const result = await res.json() as any;
              if (result.found && result.decisions && result.decisions.length > 0) {
                logger.info(`[Initial Scan] Found ${result.decisions.length} decisions in #${channelName}! Posting embeds...`);
                await this.addReactionSafely(newestMsg, '📝');

                if ('send' in channel) {
                  for (const decision of result.decisions) {
                    const actionItemsText = decision.actionItems && decision.actionItems.length > 0
                      ? `\n\n**📋 후속 조치:**\n` + decision.actionItems.map((a: any) => `• ${a.task} ${a.assignee ? `(@${a.assignee})` : ''}`).join('\n')
                      : '';

                    const embed = new EmbedBuilder()
                      .setTitle(`📝 [초기 스캔] 의사결정 기록: [${decision.topic}]`)
                      .setDescription(`**🎯 결정:** ${decision.decision}\n**💡 근거:** ${decision.rationale}${actionItemsText}`)
                      .setFooter({ text: `ID: ${decision.id} | 상태: ${decision.state}` })
                      .setColor(0x10b981);

                    await channel.send({ embeds: [embed] });
                  }
                }
              } else {
                // Advance checkpoint so we don't re-scan next time
                await fetch(`${this.backendUrl}/api/channels/${channelId}/checkpoint`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lastMessageId: newestMsg.id })
                });
              }
            }

            // Polite throttle between channels to respect Discord rate limits
            await new Promise(r => setTimeout(r, 400));
          } catch (err: any) {
            logger.warn(`[Initial Scan] Failed to scan channel #${channelName}: ${err.message}`);
          }
        }
      } catch (err: any) {
        logger.warn(`[Initial Scan] Failed to fetch channels for guild ${guild.name}: ${err.message}`);
      }
    }
    logger.info(`[Initial Scan] Completed initial channel scan.`);
  }

  async start(token?: string) {
    const botToken = token || process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      throw new Error('DISCORD_BOT_TOKEN is required to start the bot');
    }
    logger.info('Authenticating Discord client with token...');
    await this.client.login(botToken);
  }
}
