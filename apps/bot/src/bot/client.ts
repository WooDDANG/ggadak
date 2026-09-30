import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  ButtonInteraction,
  ChatInputCommandInteraction,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';
import {
  Decision,
  createLogger,
  HarvestingPolicyConfig,
  DEFAULT_HARVESTING_POLICY,
  getHarvestingPolicyFromEnv,
  FeedbackSourceType
} from '@ggaddak/shared';
import { RawMessageData } from '../context/builder.js';

export interface BotConfig {
  token?: string;
  backendUrl: string;
  triggerEmoji?: string;
}

const logger = createLogger('BOT');

export const CONSENSUS_REGEX = /(~?합시다|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?진행할게요|~?완료|픽스|fix|agree)/i;

export class DecisionTrackerBot {
  public client: Client;
  private backendUrl: string;
  private triggerEmoji: string;
  private policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY;
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

  private async syncPolicyFromBackend(): Promise<void> {
    try {
      const res = await fetch(`${this.backendUrl}/api/config/policy`);
      if (res.ok) {
        this.policy = await res.json() as HarvestingPolicyConfig;
        logger.info(`[Policy] Synced centralized policy: ReactionThreshold=${this.policy.reactionThreshold}, Debounce=${this.policy.debounceMs}ms, MaxWindow=${this.policy.maxMergedWindow}`);
      } else {
        this.policy = getHarvestingPolicyFromEnv();
      }
    } catch {
      this.policy = getHarvestingPolicyFromEnv();
    }
  }

  private setupListeners() {
    this.client.on('ready', async () => {
      logger.info(`Discord Gateway connected! Logged in as ${this.client.user?.tag} (ID: ${this.client.user?.id})`);
      logger.info(`Backend AI API target: ${this.backendUrl}`);

      await this.syncPolicyFromBackend();
      logger.info(`Autonomous monitoring enabled (Keywords, Reactions >= ${this.policy.reactionThreshold}, and '${this.triggerEmoji}' Override)`);

      // Initial channel scan across uninitialized channels
      try {
        await this.scanAllChannels(this.policy.initialScanLimit);
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
          if (totalReactions >= this.policy.reactionThreshold) {
            logger.info(`[Trigger] Reaction threshold (${totalReactions} >= ${this.policy.reactionThreshold}) reached on msg ${message.id}`);
            await this.addReactionSafely(message, '👀');
            this.enqueueChannelTrigger(message, false);
          }
        } catch (err: any) {
          logger.error(`[Reaction] Error handling reaction add: ${err.message}`, { stack: err.stack });
        }
      })();
    });

    // 3. Global Interaction Listener (Buttons & Slash Commands)
    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isButton()) {
        const customId = interaction.customId;
        if (customId.startsWith('conflict:')) {
          await this.handleConflictButtonInteraction(interaction);
        }
      } else if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      }
    });
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;

    if (commandName === '피드백입력') {
      const source = interaction.options.getString('출처', true) as FeedbackSourceType;
      const content = interaction.options.getString('내용', true);
      const detail = interaction.options.getString('세부정보') || undefined;

      try {
        const res = await fetch(`${this.backendUrl}/api/feedbacks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `FB-${Date.now().toString().slice(-6)}`,
            source,
            detail,
            content,
            channelId: interaction.channelId,
            createdAt: new Date().toISOString()
          })
        });

        if (res.ok) {
          await interaction.reply({
            content: `✅ [외부 피드백 기록 완료]\n**출처**: ${source} ${detail ? `(${detail})` : ''}\n**내용**: ${content}\n*이 피드백은 향후 팀 논의 분석 시 참조 맥락으로 활용됩니다.*`,
            ephemeral: false
          });
        } else {
          await interaction.reply({ content: '⚠️ 피드백 저장 중 오류가 발생했습니다.', ephemeral: true });
        }
      } catch (err: any) {
        await interaction.reply({ content: `⚠️ 백엔드 오류: ${err.message}`, ephemeral: true });
      }
    } else if (commandName === '스캔') {
      await interaction.deferReply();
      try {
        await this.scanAllChannels(this.policy.initialScanLimit);
        await interaction.editReply('✅ 모든 채널의 과거 대화 스캔 및 워터마크 갱신이 완료되었습니다.');
      } catch (err: any) {
        await interaction.editReply(`⚠️ 스캔 중 오류 발생: ${err.message}`);
      }
    }
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
    }, this.policy.debounceMs);

    this.debounceTimers.set(channelId, timer);
    logger.info(`[Debounce] Scheduled analysis for #${channelId} in ${this.policy.debounceMs / 1000}s`);
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
    const isThread = channel.isThread();

    try {
      let rawMessages: RawMessageData[] = [];

      // 1. Thread Prioritization: If in a Discord thread, fetch thread messages from start
      if (isThread) {
        logger.info(`[Context] Channel #${channelName} is a Discord Thread. Harvesting thread history...`);
        const fetchedThread = await channel.messages.fetch({ limit: this.policy.maxMergedWindow });
        rawMessages = Array.from(fetchedThread.values()).reverse().map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId
        }));
      } else {
        // 2. Asymmetric Context Window Harvesting for standard channels (before 15, after 5)
        const beforeCount = this.policy.contextWindowBefore;
        const afterCount = this.policy.contextWindowAfter;

        const fetchedBefore = await channel.messages.fetch({ limit: beforeCount, before: message.id });
        const beforeMsgs = Array.from(fetchedBefore.values()).reverse().map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId
        }));

        const fetchedAfter = await channel.messages.fetch({ limit: afterCount, after: message.id });
        const afterMsgs = Array.from(fetchedAfter.values()).reverse().map(m => ({
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
          },
          ...afterMsgs
        ];
      }

      // Limit to maxMergedWindow
      if (rawMessages.length > this.policy.maxMergedWindow) {
        rawMessages = rawMessages.slice(-this.policy.maxMergedWindow);
      }

      logger.info(`[Context] Harvested ${rawMessages.length} messages for #${channelName}. Sending to Backend AI...`);

      // 3. Delegate analysis to Backend AI Core
      const res = await fetch(`${this.backendUrl}/api/discussions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMessages: rawMessages.map(m => ({
            id: m.id,
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
        logger.info(`[Backend] No decision candidate identified in #${channelName}: ${result.summary}`);
        await this.removeReactionSafely(message, '👀');
        if (isManualOverride && 'send' in channel) {
          await channel.send(`💡 대화 분석 결과: ${result.summary || '명확한 의사결정 사항을 발견하지 못했습니다.'}`);
        }
        return null;
      }

      logger.info(`[Backend] Extracted ${result.decisions.length} decision candidates! Updating Reaction Feedback (📝)...`);

      // Update reaction feedback
      await this.removeReactionSafely(message, '👀');
      await this.addReactionSafely(message, '📝');

      // 4. Handle conflict or render decision candidate embeds
      if (result.hasConflict && result.conflictingDecision && 'send' in channel) {
        const primaryDecision = result.decisions[0];
        await this.sendConflictPrompt(channel as any, primaryDecision, result.conflictingDecision);
      } else if ('send' in channel) {
        for (const decision of result.decisions) {
          const actionItemsText = decision.actionItems && decision.actionItems.length > 0
            ? `\n\n**📋 후속 조치:**\n` + decision.actionItems.map((a: any) => `• ${a.task} ${a.assignee ? `(@${a.assignee})` : ''}`).join('\n')
            : '';

          const alternativesText = decision.alternatives && decision.alternatives.length > 0
            ? `\n\n**🔍 검토 대안:**\n` + decision.alternatives.map((alt: any) => `• ${alt.option} (${alt.reason})`).join('\n')
            : '';

          const pivotBadge = decision.isPivot ? ' [⚠️ 피벗/변경 감지]' : '';

          const embed = new EmbedBuilder()
            .setTitle(`📝 의사결정 후보 생성 [검수 큐 등록]${pivotBadge}`)
            .setDescription(
              `**🏷️ 분류:** [${decision.categoryTag || '기타'}] **${decision.title || decision.topic}**\n\n` +
              `**🎯 결정 내용:** ${decision.decisionContent || decision.decision}\n\n` +
              `**💡 결정 근거:** ${decision.rationale}${alternativesText}${actionItemsText}`
            )
            .setFooter({ text: `ID: ${decision.id} | 상태: ${decision.state} (검수 대기) | 대시보드에서 확정 가능` })
            .setColor(decision.isPivot ? 0xf59e0b : 0x3b82f6);

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
      .setTitle('⚠️ 의사결정 충돌/피벗 감지')
      .setDescription(
        `기존 확정 결정 **[${oldDecision.id}]**과 상충되거나 수정하는 새 후보가 추출되었습니다.\n\n` +
        `**[기존 결정]**: ${oldDecision.decisionContent || oldDecision.decision}\n` +
        `**[새로운 결정]**: ${newDecision.decisionContent || newDecision.decision}\n\n` +
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
              id: m.id,
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
                      .setTitle(`📝 [초기 스캔] 의사결정 후보 생성 [검수 대기]`)
                      .setDescription(
                        `**🏷️ 분류:** [${decision.categoryTag || '기타'}] **${decision.title || decision.topic}**\n\n` +
                        `**🎯 결정 내용:** ${decision.decisionContent || decision.decision}\n\n` +
                        `**💡 결정 근거:** ${decision.rationale}${actionItemsText}`
                      )
                      .setFooter({ text: `ID: ${decision.id} | 상태: ${decision.state}` })
                      .setColor(0x3b82f6);

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
