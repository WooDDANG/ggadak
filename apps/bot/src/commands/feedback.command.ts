import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { Discord, Slash, SlashOption, SlashChoice } from 'discordx';
import { createLogger, FeedbackSourceType } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';

const logger = createLogger('FEEDBACK-CMD');

@Discord()
export class FeedbackCommand {
  private apiService: BackendApiService;

  constructor() {
    const backendUrl = process.env.BE_URL || 'http://localhost:3001';
    this.apiService = new BackendApiService(backendUrl);
  }

  @Slash({
    name: '피드백입력',
    description: '교수님, 심사위원 등 외부 피드백을 기록하여 AI 의사결정 맥락에 주입합니다.',
  })
  async execute(
    @SlashChoice({ name: '교수', value: '교수' })
    @SlashChoice({ name: '심사위원', value: '심사위원' })
    @SlashChoice({ name: '팀원', value: '팀원' })
    @SlashChoice({ name: '인터뷰이', value: '인터뷰이' })
    @SlashOption({
      name: '출처',
      description: '피드백 출처',
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    source: FeedbackSourceType,

    @SlashOption({
      name: '내용',
      description: '피드백 상세 내용',
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    content: string,

    @SlashOption({
      name: '세부정보',
      description: '추가 설명/메모 (예: 중간발표 2조 질문)',
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    detail: string | undefined,

    interaction: CommandInteraction,
  ): Promise<void> {
    const channelId = interaction.channelId;

    const feedback = {
      id: `FB-${Date.now().toString().slice(-6)}`,
      source,
      detail: detail || undefined,
      content,
      channelId: channelId || 'global',
      createdAt: new Date().toISOString(),
    };

    const saved = await this.apiService.saveFeedback(feedback);
    if (saved) {
      await interaction.reply({
        content: `✅ [외부 피드백 기록 완료]\n**출처**: ${source} ${detail ? `(${detail})` : ''}\n**내용**: ${content}\n*이 피드백은 향후 팀 논의 분석 시 참조 맥락으로 활용됩니다.*`,
        ephemeral: true,
      });
      logger.info(`Recorded external feedback [${feedback.id}] via discordx slash command`);
    } else {
      await interaction.reply({
        content: '❌ 외부 피드백 저장 중 백엔드 통신 오류가 발생했습니다.',
        ephemeral: true,
      });
    }
  }
}
