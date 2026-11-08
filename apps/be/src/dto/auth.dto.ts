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

export interface GuildSelectionDto {
  status: 'ready' | 'unavailable';
  checkedAt: string | null;
}

export interface GuildVerificationDto {
  status: 'ready' | 'unavailable' | 'rate_limited';
  retryAt: string | null;
  eventCoverage: 'trusted' | 'members_intent_disabled' | 'disconnected' | 'expired' | 'unknown';
}
