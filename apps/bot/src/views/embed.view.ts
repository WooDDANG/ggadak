import { EmbedBuilder } from 'discord.js';
import { Decision } from '@ggaddak/shared';

export class BotEmbedView {
  static renderCandidateEmbed(decision: Decision, totalMessagesCount: number): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`📋 [검수 큐 후보] ${decision.title || decision.topic}`)
      .setColor(decision.isPivot ? 0xff9900 : 0x00ae86)
      .setDescription(
        `AI가 대화 맥락(${totalMessagesCount}개 메시지)에서 새로운 의사결정 후보를 감지하여 **DRAFT** 상태로 등록했습니다.\n웹 대시보드 검수 큐에서 확정/보류/수정/삭제를 진행해 주세요.`,
      )
      .addFields(
        {
          name: '📌 결정 내용',
          value: decision.decisionContent || decision.decision || 'N/A',
          inline: false,
        },
        {
          name: '💡 결정 이유/맥락',
          value: decision.rationale || 'N/A',
          inline: false,
        },
        {
          name: '🏷️ 카테고리',
          value: decision.categoryTag || '기타',
          inline: true,
        },
        {
          name: '🔄 피벗 여부',
          value: decision.isPivot ? '⚠️ 기존 결정 수정/대체 (Pivot)' : '신규 결정',
          inline: true,
        },
      );

    if (decision.alternatives && decision.alternatives.length > 0) {
      embed.addFields({
        name: '🚫 기각/검토된 대안',
        value: decision.alternatives.map(a => `- **${a.option}**: ${a.reason}`).join('\n'),
        inline: false,
      });
    }

    if (decision.actionItems && decision.actionItems.length > 0) {
      embed.addFields({
        name: '✅ 액션 아이템',
        value: decision.actionItems
          .map(
            a =>
              `- [ ] ${a.task}${a.assignee ? ` (@${a.assignee})` : ''}${a.dueDate ? ` (~${a.dueDate})` : ''}`,
          )
          .join('\n'),
        inline: false,
      });
    }

    embed.setFooter({
      text: `Decision ID: ${decision.id} | 상태: ${decision.state}`,
    });

    return embed;
  }
}
