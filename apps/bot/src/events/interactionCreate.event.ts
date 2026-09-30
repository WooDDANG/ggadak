import { Client, Events, Interaction, Collection } from 'discord.js';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { BotCommand } from '../commands/index.js';
import { BackendApiService } from '../services/backend-api.service.js';
import { InteractionHandler } from '../handlers/interaction.handler.js';

const logger = createLogger('INTERACTION-EVENT');

export function handleInteractionCreateEvent({
  client,
  commands,
  apiService,
  interactionHandler,
  getPolicy,
  onScanChannels,
}: {
  client: Client;
  commands: Collection<string, BotCommand>;
  apiService: BackendApiService;
  interactionHandler: InteractionHandler;
  getPolicy: () => HarvestingPolicyConfig;
  onScanChannels: (limit: number) => Promise<void>;
}) {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (command) {
          if (interaction.commandName === '스캔') {
            await command.execute(interaction, onScanChannels);
          } else if (interaction.commandName === '피드백입력') {
            await command.execute(interaction, apiService);
          }
        } else {
          await interactionHandler.handleSlashCommand(interaction, getPolicy());
        }
      } else if (interaction.isButton()) {
        await interactionHandler.handleButton(interaction);
      }
    } catch (err: any) {
      logger.error(`Error executing interaction: ${err.message}`);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({
          content: '❌ 명령 또는 상호작용 처리 중 오류가 발생했습니다.',
          ephemeral: true,
        });
      }
    }
  });
}
