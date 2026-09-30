import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { createLogger } from '@ggaddak/shared';

const logger = createLogger('SCAN-CMD');

export const scanCommand = {
  data: new SlashCommandBuilder()
    .setName('스캔')
    .setDescription('현재 채널의 최근 논의를 수동 스캔하여 의사결정을 추출합니다.')
    .addIntegerOption(opt =>
      opt.setName('limit').setDescription('분석할 최근 메시지 수 (기본 30개)').setMinValue(5).setMaxValue(100),
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    onScanChannels: (limit: number) => Promise<void>,
  ) {
    const limit = interaction.options.getInteger('limit') || 30;
    await interaction.deferReply();

    try {
      await onScanChannels(limit);
      await interaction.editReply(
        '✅ 모든 채널의 과거 대화 스캔 및 워터마크 갱신이 완료되었습니다.',
      );
      logger.info(`Manual scan command finished`);
    } catch (err: any) {
      logger.error(`Error during manual scan: ${err.message}`);
      await interaction.editReply({ content: `❌ 스캔 중 오류가 발생했습니다: ${err.message}` });
    }
  },
};
