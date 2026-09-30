import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';
import { createLogger } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';

const logger = createLogger('SCAN-CMD');

@Discord()
export class ScanCommand {
  private apiService: BackendApiService;

  constructor() {
    const backendUrl = process.env.BE_URL || 'http://localhost:3001';
    this.apiService = new BackendApiService(backendUrl);
  }

  @Slash({
    name: '스캔',
    description: '현재 채널의 최근 논의를 수동 스캔하여 의사결정을 추출합니다.',
  })
  async execute(
    @SlashOption({
      name: 'limit',
      description: '분석할 최근 메시지 수 (기본 30개)',
      required: false,
      type: ApplicationCommandOptionType.Integer,
      minValue: 5,
      maxValue: 100,
    })
    limit: number | undefined,

    interaction: CommandInteraction,
  ): Promise<void> {
    const scanLimit = limit || 30;
    await interaction.deferReply();

    try {
      logger.info(`Manual scan initiated with limit=${scanLimit} for channel=${interaction.channelId}`);
      await interaction.editReply(
        `🔍 최근 ${scanLimit}개의 메시지 스캔을 요청했습니다. 백엔드 AI가 분석을 완료하는 대로 요약 카드를 게시합니다.`,
      );
    } catch (err: any) {
      logger.error(`Error during scan command: ${err.message}`);
      await interaction.editReply(`⚠️ 스캔 중 오류 발생: ${err.message}`);
    }
  }
}
