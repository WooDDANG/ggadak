import { CommandInteraction, ApplicationCommandOptionType, TextChannel } from 'discord.js';
import { Discord, Slash, SlashOption, SlashChoice } from 'discordx';
import { DEFAULT_HARVESTING_POLICY, createLogger } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';
import { AnalysisService } from '../services/analysis.service.js';

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
    description: '채널 또는 서버 전체의 대화를 스캔하여 의사결정을 추출합니다.',
  })
  async execute(
    @SlashChoice({ name: '현재 채널', value: 'channel' })
    @SlashChoice({ name: '서버 전체 채널', value: 'server' })
    @SlashOption({
      name: '범위',
      description: '스캔할 범위 (현재 채널 또는 서버 전체, 기본: 현재 채널)',
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    scope: 'channel' | 'server' = 'channel',

    @SlashOption({
      name: '시간_시간단위',
      description: '최근 N시간 이내의 대화만 스캔 (예: 6, 24, 72)',
      required: false,
      type: ApplicationCommandOptionType.Integer,
      minValue: 1,
    })
    hours: number | undefined,

    @SlashOption({
      name: '전체조회',
      description: '과거 대화 전체를 처음부터 끝까지 스캔할지 여부 (기본: false)',
      required: false,
      type: ApplicationCommandOptionType.Boolean,
    })
    full: boolean | undefined,

    @SlashOption({
      name: '메시지수',
      description: '가져올 최대 메시지 수 (기본: 50개, 전체조회 시 생략 가능)',
      required: false,
      type: ApplicationCommandOptionType.Integer,
      minValue: 5,
      maxValue: 1000,
    })
    limit: number | undefined,

    interaction: CommandInteraction,
  ): Promise<void> {
    await interaction.deferReply();

    const analysisService = AnalysisService.getInstance();
    if (!analysisService) {
      await interaction.editReply('⚠️ 봇 분석 서비스(AnalysisService)가 초기화되지 않았습니다.');
      return;
    }

    const policy = (await this.apiService.syncPolicy()) || DEFAULT_HARVESTING_POLICY;

    try {
      const scanOptions = {
        full: full ?? (hours ? false : false),
        hours,
        limit: limit || (full ? undefined : 50),
      };

      const scopeText = scope === 'server' ? '서버 전체 채널' : '현재 채널';
      const timeText = hours ? `최근 ${hours}시간` : full ? '과거 전체 대화' : '최신 대화';

      logger.info(
        `[Manual Scan] Triggered by @${interaction.user.username} (scope=${scope}, hours=${hours}, full=${full}, limit=${limit})`,
      );

      if (scope === 'server') {
        if (!interaction.guild) {
          await interaction.editReply('⚠️ 서버 내부에서만 서버 전체 스캔을 실행할 수 있습니다.');
          return;
        }

        await interaction.editReply(
          `🔍 **[서버 전체 스캔 시작]** ${timeText} 대화를 탐색 중입니다... (채널 수에 따라 수초 소요될 수 있습니다)`,
        );

        const res = await analysisService.scanGuild(interaction.guild, policy, scanOptions);

        await interaction.editReply(
          `✅ **[서버 전체 스캔 완료]**\n- 📂 대상 채널: **${res.channelCount}개**\n- 💬 검사한 메시지: **${res.scannedCount}개**\n- 📌 추출된 의사결정: **${res.decisionsCount}건**`,
        );
      } else {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || channel.isThread()) {
          await interaction.editReply('⚠️ 일반 텍스트 채널에서만 채널 스캔을 실행할 수 있습니다.');
          return;
        }

        await interaction.editReply(
          `🔍 **[채널 스캔 시작]** #${'name' in channel ? channel.name : 'channel'}의 ${timeText} 대화를 탐색 중입니다...`,
        );

        const res = await analysisService.scanChannel(channel as TextChannel, policy, scanOptions);

        await interaction.editReply(
          `✅ **[채널 스캔 완료]**\n- 📂 채널: **#${'name' in channel ? channel.name : 'channel'}**\n- 💬 검사한 메시지: **${res.scannedCount}개**\n- 📌 추출된 의사결정: **${res.decisionsCount}건**`,
        );
      }
    } catch (err: any) {
      logger.error(`Error during scan command: ${err.message}`, { stack: err.stack });
      await interaction.editReply(`⚠️ 스캔 중 오류 발생: ${err.message}`);
    }
  }
}

