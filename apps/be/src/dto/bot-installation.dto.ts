export type BotInstallationStatus = 'installed' | 'not_installed' | 'unknown';

export interface BotInstallationStatusDto {
  guildId: string;
  status: BotInstallationStatus;
  canManage: boolean;
  installUrl: string | null;
  checkedAt: string;
}
