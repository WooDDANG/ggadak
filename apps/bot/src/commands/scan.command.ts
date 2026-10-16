import { backendUrl as getBackendUrl, reviewWebUrl } from '../config.js';
import { CommandInteraction, ApplicationCommandOptionType, TextChannel } from 'discord.js';
import { Discord, Slash, SlashOption, SlashChoice } from 'discordx';
import { DEFAULT_HARVESTING_POLICY, createLogger } from '@ggaddak/shared';
import { AnalysisDeliveryError, BackendApiService } from '../services/backend-api.service.js';
import { ScanIncompleteError } from '../services/harvester.service.js';
import { AnalysisService, DecisionHarvestingEngine } from '../services/analysis.service.js';

const logger = createLogger('SCAN-CMD');

@Discord()
export class ScanCommand {
  private apiService: BackendApiService;

  constructor() {
    const backendUrl = getBackendUrl();
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
    await interaction.deferReply({ ephemeral: true });
    const reviewLink = reviewWebUrl();
    const reply = async (content: string) =>
      interaction.editReply(`${content}\n검토·분석 복구: ${reviewLink}`);

    const harvester = AnalysisService.getInstance();
    if (!harvester) {
      await reply('⚠️ 봇 분석 서비스(AnalysisService)가 초기화되지 않았습니다.');
      return;
    }

    const engine = new DecisionHarvestingEngine(this.apiService, harvester);
    const policy = (await this.apiService.syncPolicy()) || DEFAULT_HARVESTING_POLICY;

    try {
      const scanOptions = {
        forceFullSync: true,
        full: full ?? (hours ? false : false),
        hours,
        limit: limit || (full ? undefined : 50),
      };

      const timeText = hours ? `최근 ${hours}시간` : full ? '과거 전체 대화' : '최신 대화';

      logger.info(
        `[Manual Scan] Triggered by @${interaction.user.username} (scope=${scope}, hours=${hours}, full=${full}, limit=${limit})`,
      );

      if (scope === 'server') {
        if (!interaction.guild) {
          await reply('⚠️ 서버 내부에서만 서버 전체 스캔을 실행할 수 있습니다.');
          return;
        }

        await reply(
          `🔍 **[서버 전체 스캔 시작]** ${timeText} 대화를 탐색 중입니다... (채널 수에 따라 수초 소요될 수 있습니다)`,
        );

        const res = await engine.harvest(
          { type: 'SCAN', target: interaction.guild, options: scanOptions },
          policy,
        );

        await reply(
          res.pendingAnalysis
            ? `📥 **[서버 데이터 전달 완료 · 분석 진행 중]**\n- 대상 채널: ${res.channelCount || 0}개\n- 전달한 메시지: ${res.messageCount}개\n분석 완료·실패 결과는 웹에서 확인해 주세요.`
            : `✅ **[서버 전체 스캔 완료]**\n- 📂 대상 채널: **${res.channelCount || 0}개**\n- 💬 검사한 메시지: **${res.messageCount}개**\n- 📌 추출된 의사결정: **${res.decisionsCount}건**`,
        );
      } else {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || channel.isThread()) {
          await reply('⚠️ 일반 텍스트 채널에서만 채널 스캔을 실행할 수 있습니다.');
          return;
        }

        await reply(
          `🔍 **[채널 스캔 시작]** #${'name' in channel ? channel.name : 'channel'}의 ${timeText} 대화를 탐색 중입니다...`,
        );

        const res = await engine.harvest(
          { type: 'SCAN', target: channel as TextChannel, options: scanOptions },
          policy,
        );

        await reply(
          res.pendingAnalysis
            ? `📥 **[채널 데이터 전달 완료 · 분석 진행 중]**\n- 전달한 메시지: ${res.messageCount}개\n분석 완료·실패 결과는 웹에서 확인해 주세요.`
            : `✅ **[채널 스캔 완료]**\n- 📂 채널: **#${'name' in channel ? channel.name : 'channel'}**\n- 💬 검사한 메시지: **${res.messageCount}개**\n- 📌 추출된 의사결정: **${res.decisionsCount}건**`,
        );
      }
    } catch (err: any) {
      logger.error(`Error during scan command: ${err.message}`, { stack: err.stack });
      if (err instanceof ScanIncompleteError) {
        await reply(
          `⚠️ 스캔 일부가 미완료입니다. 분석 구간 ${err.completed}개 완료 · ${err.pending}개 재시도 대기 · ${err.failed}개 확인 필요`,
        );
        return;
      }
      const status =
        err instanceof AnalysisDeliveryError && err.outcome === 'retry-pending'
          ? '분석 요청을 보관했습니다. 연결 복구 후 자동 재시도합니다.'
          : '스캔을 완료하지 못했습니다. 보관된 실패 요청을 확인해 주세요.';
      await reply(`⚠️ ${status}`);
    }
  }
}
