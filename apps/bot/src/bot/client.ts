import {
  Client,
  GatewayIntentBits,
  Partials,
  MessageReaction,
  User,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  Message
} from 'discord.js';
import { Decision, DecisionPayload, createLogger } from '@ggaddak/shared';
import { DiscussionContextBuilder, RawMessageData } from '../context/builder.js';
import { DecisionExtractor } from '../extractor/engine.js';
import { ConflictDetector } from '../conflict/detector.js';
import { EgressQueue } from '../egress/queue.js';

export interface BotConfig {
  token?: string;
  webhookUrl: string;
  triggerEmoji?: string;
}

const logger = createLogger('BOT');

export class DecisionTrackerBot {
  public client: Client;
  private extractor: DecisionExtractor;
  private conflictDetector: ConflictDetector;
  private queue: EgressQueue;
  private webhookUrl: string;
  private triggerEmoji: string;

  constructor(
    config: BotConfig,
    extractor = new DecisionExtractor(),
    conflictDetector = new ConflictDetector(),
    queue = new EgressQueue(':memory:')
  ) {
    this.webhookUrl = config.webhookUrl;
    this.triggerEmoji = config.triggerEmoji || '📌';
    this.extractor = extractor;
    this.conflictDetector = conflictDetector;
    this.queue = queue;

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
      logger.info(`Monitoring trigger emoji '${this.triggerEmoji}' across all joined channels`);
    });

    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;
      if (reaction.emoji.name !== this.triggerEmoji) return;

      logger.info(`[Reaction] '${reaction.emoji.name}' added by @${user.username} on msg ${reaction.message.id}`);

      try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        await this.handleReactionTrigger(reaction.message as Message, user.username || undefined);
      } catch (err: any) {
        logger.error(`[Reaction] Error processing reaction trigger: ${err.message}`, { stack: err.stack });
      }
    });
  }

  async handleReactionTrigger(message: Message, triggeredBy?: string): Promise<Decision | null> {
    const channel = message.channel;
    if (!channel.isTextBased()) return null;

    const channelName = 'name' in channel ? (channel.name as string) : 'dm';
    logger.info(`[Context] Fetching surrounding message history for #${channelName}...`);

    // Fetch surrounding messages
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

    logger.info(`[Context] Built transcript with ${rawMessages.length} messages in #${channelName}`);
    const transcript = DiscussionContextBuilder.buildTranscript(rawMessages);
    
    logger.info(`[LLM] Requesting Decision and Rationale extraction...`);
    const extracted = await this.extractor.extract(transcript);

    if (!extracted) {
      logger.warn(`[LLM] No decision consensus found in discussion context of #${channelName}`);
      if ('send' in channel) {
        await channel.send('💡 이 대화 맥락에서 명확한 의사결정 사항을 발견하지 못했습니다.');
      }
      return null;
    }

    logger.info(`[LLM] Extraction success! Topic="[${extracted.topic}]" Decision="[${extracted.decision}]"`);

    const participants = DiscussionContextBuilder.extractParticipantHandles(rawMessages);
    const conflict = this.conflictDetector.checkConflict(extracted.topic);

    const decisionId = `DEC-${Date.now().toString().slice(-6)}`;
    const newDecision: Decision = {
      id: decisionId,
      topic: extracted.topic,
      decision: extracted.decision,
      rationale: extracted.rationale,
      actionItems: extracted.actionItems,
      state: 'Decided',
      supersedesId: null,
      source: {
        guildId: message.guildId || 'dm',
        channelId: message.channelId,
        channelName: channelName,
        triggerMessageId: message.id,
        messageUrl: message.url,
        participants
      },
      createdAt: new Date().toISOString()
    };

    if (conflict.hasConflict && conflict.conflictingDecision && 'send' in channel) {
      logger.warn(`[Conflict] Detected decision conflict with [${conflict.conflictingDecision.id}]. Prompting Discord confirmation...`);
      return this.promptConflictResolution(channel as any, newDecision, conflict.conflictingDecision);
    } else {
      return this.finalizeDecision(newDecision, channel);
    }
  }

  private async promptConflictResolution(
    channel: { send: Function },
    newDecision: Decision,
    oldDecision: Decision
  ): Promise<Decision> {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ 의사결정 충돌/변경 감지')
      .setDescription(
        `기존 결정 **[${oldDecision.id}]**과 유사한 새 결정이 추출되었습니다.\n\n` +
        `**[기존 결정]**: ${oldDecision.decision}\n` +
        `**[새로운 결정]**: ${newDecision.decision}\n\n` +
        `어떻게 처리할까요?`
      )
      .setColor(0xf59e0b);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('supersede')
        .setLabel('기존 결정 대체 (Supersede)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('independent')
        .setLabel('독립 결정으로 유지')
        .setStyle(ButtonStyle.Secondary)
    );

    const promptMsg = await channel.send({ embeds: [embed], components: [row] });

    try {
      const interaction = await promptMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30000
      });

      if (interaction.customId === 'supersede') {
        newDecision.supersedesId = oldDecision.id;
        logger.info(`[Conflict] User chose to supersede previous decision [${oldDecision.id}]`);
        await interaction.update({
          content: `✅ 기존 결정 **[${oldDecision.id}]**을 대체하고 새 결정을 기록했습니다.`,
          embeds: [],
          components: []
        });
      } else {
        logger.info(`[Conflict] User chose to keep both decisions independently`);
        await interaction.update({
          content: `✅ 독립된 별도 결정으로 함께 기록했습니다.`,
          embeds: [],
          components: []
        });
      }
    } catch {
      logger.warn(`[Conflict] Interactive prompt timed out (30s). Keeping decision independent by default.`);
      await promptMsg.edit({ components: [] });
    }

    return this.finalizeDecision(newDecision, channel);
  }

  private async finalizeDecision(decision: Decision, channel?: any): Promise<Decision> {
    this.conflictDetector.registerDecision(decision);

    const payload: DecisionPayload = {
      event: 'decision.recorded',
      version: '1.0.0',
      payload: decision
    };

    this.queue.enqueue(payload);
    logger.info(`[Egress] Decision [${decision.id}] enqueued. Dispatching to Webhook (${this.webhookUrl})...`);

    const result = await this.queue.dispatchPending(this.webhookUrl);
    if (result.sent > 0) {
      logger.info(`[Egress] Successfully dispatched decision [${decision.id}] to Backend (200 OK)`);
    } else {
      logger.warn(`[Egress] Failed to dispatch decision [${decision.id}] to Backend. Kept in SQLite retry queue.`);
    }

    if (channel && 'send' in channel) {
      const embed = new EmbedBuilder()
        .setTitle(`📝 의사결정 기록 완료: [${decision.topic}]`)
        .setDescription(`**결정:** ${decision.decision}\n**근거:** ${decision.rationale}`)
        .setFooter({ text: `ID: ${decision.id} | 상태: ${decision.state}` })
        .setColor(0x10b981);

      await channel.send({ embeds: [embed] });
    }

    return decision;
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
