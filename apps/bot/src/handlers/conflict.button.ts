import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { Discord, ButtonComponent } from 'discordx';
import { createLogger } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';

const logger = createLogger('CONFLICT-BUTTON');

@Discord()
export class ConflictButtonHandler {
  private backendApi: BackendApiService;

  constructor() {
    const backendUrl = process.env.BE_URL || 'http://localhost:3001';
    this.backendApi = new BackendApiService(backendUrl);
  }

  @ButtonComponent({ id: /conflict:.*/ })
  async handleConflictButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    const [, resolution, newDecisionId, conflictingId] = customId.split(':');
    await interaction.deferUpdate();

    try {
      const success = await this.backendApi.resolveConflict({
        decisionId: newDecisionId,
        conflictingId,
        resolution: resolution as 'supersede' | 'coexist',
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

      logger.info(`[Button] Successfully finalized conflict resolution on Discord via discordx`);
    } catch (err: any) {
      logger.error(`[Button] Failed to process conflict resolution: ${err.message}`, {
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
}
