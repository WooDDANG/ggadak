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

export class DecisionTrackerBot {
  public client: Client;
  private backendUrl: string;
  private triggerEmoji: string;

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
    this.client.on('ready', () => {
      logger.info(`Discord Gateway connected! Logged in as ${this.client.user?.tag} (ID: ${this.client.user?.id})`);
      logger.info(`Backend AI API target: ${this.backendUrl}`);
      logger.info(`Monitoring trigger emoji '${this.triggerEmoji}' across all joined channels`);
    });

    // 1. Non-blocking Reaction Trigger Listener
    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;
      if (reaction.emoji.name !== this.triggerEmoji) return;

      logger.info(`[Reaction] '${reaction.emoji.name}' added by @${user.username} on msg ${reaction.message.id}`);

      // Run asynchronously in background without blocking future reaction events
      (async () => {
        try {
          if (reaction.partial) await reaction.fetch();
          if (reaction.message.partial) await reaction.message.fetch();

          await this.handleReactionTrigger(reaction.message as Message, user.username || undefined);
        } catch (err: any) {
          logger.error(`[Reaction] Error processing reaction trigger: ${err.message}`, { stack: err.stack });
        }
      })();
    });

    // 2. Global Non-blocking Button Interaction Listener (Eliminates 3-second timeout)
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const customId = interaction.customId;
      if (customId.startsWith('conflict:')) {
        await this.handleConflictButtonInteraction(interaction);
      }
    });
  }

  private async handleConflictButtonInteraction(interaction: ButtonInteraction) {
    // 1. Immediately defer update to prevent Discord's 3-second timeout error
    try {
      await interaction.deferUpdate();
    } catch (err: any) {
      logger.warn(`[Interaction] Failed to defer update (might have already expired): ${err.message}`);
      return;
    }

    const [, resolution, newDecisionId, conflictingId] = interaction.customId.split(':');
    logger.info(`[Interaction] Button clicked by @${interaction.user.username}: resolution=${resolution}, new=${newDecisionId}, conflicting=${conflictingId}`);

    try {
      // 2. Notify Backend of conflict resolution
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

      // 3. Update message and remove buttons to prevent duplicate clicks
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
        components: [] // Clear action buttons
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

  async handleReactionTrigger(message: Message, triggeredBy?: string): Promise<Decision[] | null> {
    const channel = message.channel;
    if (!channel.isTextBased()) return null;

    const channelName = 'name' in channel ? (channel.name as string) : 'dm';
    logger.info(`[Context] Fetching surrounding message history for #${channelName}...`);

    // 1. Fetch surrounding messages
    const fetched = await channel.messages.fetch({ limit: 30, before: message.id });
    const rawMessages: RawMessageData[] = [
      ...Array.from(fetched.values()).map(m => ({
        id: m.id,
        authorId: m.author.id,
        authorName: m.author.username,
        content: m.content,
        createdAt: m.createdAt,
        referenceMessageId: m.reference?.messageId,
      })),
      {
        id: message.id,
        authorId: message.author.id,
        authorName: message.author.username,
        content: message.content,
        createdAt: message.createdAt
      }
    ];

    logger.info(`[Context] Harvested ${rawMessages.length} messages. Sending to Backend AI (${this.backendUrl}/api/discussions/analyze)...`);

    // 2. Delegate analysis to Backend AI Core
    try {
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
        return null;
      }

      const result = await res.json() as any;

      if (!result.found || !result.decisions || result.decisions.length === 0) {
        logger.info(`[Backend] No decision consensus identified in #${channelName}`);
        if ('send' in channel) {
          await channel.send('💡 이 대화 맥락에서 명확한 의사결정 사항을 발견하지 못했습니다.');
        }
        return null;
      }

      logger.info(`[Backend] Extracted ${result.decisions.length} decisions from discussion!`);

      // 3. Handle conflict if detected (Send embed with encoded button custom IDs)
      if (result.hasConflict && result.conflictingDecision && 'send' in channel) {
        const primaryDecision = result.decisions[0];
        await this.sendConflictPrompt(channel as any, primaryDecision, result.conflictingDecision);
      } else if ('send' in channel) {
        // 4. Render confirmation embed in Discord channel
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
      logger.error(`[Backend] Network or analysis error: ${err.message}`, { stack: err.stack });
      return null;
    }
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

  async start(token?: string) {
    const botToken = token || process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      throw new Error('DISCORD_BOT_TOKEN is required to start the bot');
    }
    logger.info('Authenticating Discord client with token...');
    await this.client.login(botToken);
  }
}
