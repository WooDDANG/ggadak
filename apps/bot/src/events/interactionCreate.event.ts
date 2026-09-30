import { Events, Interaction } from 'discord.js';
import { Client } from 'discordx';
import { createLogger } from '@ggaddak/shared';

const logger = createLogger('INTERACTION-EVENT');

export function handleInteractionCreateEvent(client: Client) {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      await client.executeInteraction(interaction);
    } catch (err: any) {
      logger.error(`Error executing interaction via discordx: ${err.message}`);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({
          content: '❌ 명령 또는 상호작용 처리 중 오류가 발생했습니다.',
          ephemeral: true,
        });
      }
    }
  });
}
