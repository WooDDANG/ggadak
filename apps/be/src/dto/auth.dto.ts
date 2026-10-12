export interface AuthUserDto {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  discordUserId: string;
}
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
}
