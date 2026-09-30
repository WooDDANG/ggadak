import { ButtonInteraction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { FeedbackSourceType, HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';

const logger = createLogger('BOT-INTERACTION-HANDLER');

export class InteractionHandler {
  constructor(
    private backendApi: BackendApiService,
    private onScanChannels: (limit: number) => Promise<void>,
  ) {}

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    if (!customId.startsWith('conflict:')) return;

    const [, resolution, newDecisionId, conflictingId] = customId.split(':');
    await interaction.deferUpdate();

    try {
      const success = await this.backendApi.resolveConflict({
        decisionId: newDecisionId,
        conflictingId,
        resolution,
      });

      if (!success) {
        throw new Error('Backend conflict resolution request failed');
      }

      const isSupersede = resolution === 'supersede';
      const embed = new EmbedBuilder()
        .setTitle(
          isSupersede ? '✅ 기존 결정 대체 완료 (Superseded)' : '✅ 독립 결정으로 보존 완료',
        )
        .setDescription(
          isSupersede
            ? `기존 결정 **[${conflictingId}]**을 대체하고 새 결정 **[${newDecisionId}]**으로 확정했습니다.`
            : `기존 결정 **[${conflictingId}]**과 새 결정 **[${newDecisionId}]**을 모두 독립적으로 유지합니다.`,
        )
        .setColor(isSupersede ? 0x10b981 : 0x3b82f6)
        .setFooter({ text: `처리 완료 (@${interaction.user.username}) | ID: ${newDecisionId}` });

      await interaction.editReply({
        embeds: [embed],
        components: [],
      });

      logger.info(`[Interaction] Successfully finalized conflict resolution on Discord`);
    } catch (err: any) {
      logger.error(`[Interaction] Failed to process conflict resolution: ${err.message}`, {
        stack: err.stack,
      });
      try {
        await interaction.editReply({
          content: '⚠️ 충돌 해결 처리 중 오류가 발생했습니다. 백엔드 연결 상태를 확인해주세요.',
          components: [],
        });
      } catch {}
    }
  }

  async handleSlashCommand(
    interaction: ChatInputCommandInteraction,
    policy: HarvestingPolicyConfig,
  ): Promise<void> {
    const { commandName } = interaction;

    if (commandName === '피드백입력') {
      const source = interaction.options.getString('출처', true) as FeedbackSourceType;
      const content = interaction.options.getString('내용', true);
      const detail = interaction.options.getString('세부정보') || undefined;

      try {
        const success = await this.backendApi.saveFeedback({
          id: `FB-${Date.now().toString().slice(-6)}`,
          source,
          detail,
          content,
          channelId: interaction.channelId,
          createdAt: new Date().toISOString(),
        });

        if (success) {
          await interaction.reply({
            content: `✅ [외부 피드백 기록 완료]\n**출처**: ${source} ${detail ? `(${detail})` : ''}\n**내용**: ${content}\n*이 피드백은 향후 팀 논의 분석 시 참조 맥락으로 활용됩니다.*`,
            ephemeral: false,
          });
        } else {
          await interaction.reply({
            content: '⚠️ 피드백 저장 중 오류가 발생했습니다.',
            ephemeral: true,
          });
        }
      } catch (err: any) {
        await interaction.reply({ content: `⚠️ 백엔드 오류: ${err.message}`, ephemeral: true });
      }
    } else if (commandName === '스캔') {
      await interaction.deferReply();
      try {
        await this.onScanChannels(policy.initialScanLimit);
        await interaction.editReply(
          '✅ 모든 채널의 과거 대화 스캔 및 워터마크 갱신이 완료되었습니다.',
        );
      } catch (err: any) {
        await interaction.editReply(`⚠️ 스캔 중 오류 발생: ${err.message}`);
      }
    }
  }
}
