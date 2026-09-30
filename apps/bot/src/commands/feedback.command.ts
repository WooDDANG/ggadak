import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { createLogger } from '@ggaddak/shared';
import { BackendApiService } from '../services/backend-api.service.js';

const logger = createLogger('FEEDBACK-CMD');

export const feedbackCommand = {
  data: new SlashCommandBuilder()
    .setName('피드백입력')
    .setDescription('교수님, 심사위원 등 외부 피드백을 기록하여 AI 의사결정 맥락에 주입합니다.')
    .addStringOption(opt =>
      opt
        .setName('출처')
        .setDescription('피드백 출처')
        .setRequired(true)
        .addChoices(
          { name: '교수', value: '교수' },
          { name: '심사위원', value: '심사위원' },
          { name: '팀원', value: '팀원' },
          { name: '인터뷰이', value: '인터뷰이' },
        ),
    )
    .addStringOption(opt =>
      opt.setName('내용').setDescription('피드백 상세 내용').setRequired(true),
    )
    .addStringOption(opt =>
      opt.setName('세부정보').setDescription('추가 설명/메모 (예: 중간발표 2조 질문)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, apiService: BackendApiService) {
    const source = interaction.options.getString('출처', true) as '교수' | '심사위원' | '팀원' | '인터뷰이';
    const content = interaction.options.getString('내용', true);
    const detail = interaction.options.getString('세부정보') || undefined;
    const channelId = interaction.channelId;

    const feedback = {
      id: `FB-${Date.now().toString().slice(-6)}`,
      source,
      detail,
      content,
      channelId,
      createdAt: new Date().toISOString(),
    };

    const saved = await apiService.saveFeedback(feedback);
    if (saved) {
      await interaction.reply({
        content: `✅ [외부 피드백 기록 완료]\n**출처**: ${source} ${detail ? `(${detail})` : ''}\n**내용**: ${content}\n*이 피드백은 향후 팀 논의 분석 시 참조 맥락으로 활용됩니다.*`,
        ephemeral: false,
      });
      logger.info(`Recorded external feedback [${feedback.id}] via slash command`);
    } else {
      await interaction.reply({
        content: '❌ 외부 피드백 저장 중 백엔드 통신 오류가 발생했습니다.',
        ephemeral: true,
      });
    }
  },
};
