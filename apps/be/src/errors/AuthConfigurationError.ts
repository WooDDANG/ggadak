import { AppError } from './AppError.js';

const settingNames = {
  clientId: 'DISCORD_CLIENT_ID',
  clientSecret: 'DISCORD_CLIENT_SECRET',
  redirectUri: 'DISCORD_REDIRECT_URI',
  secret: 'AUTH_SECRET (32자 이상)',
  secureCookie: 'NODE_ENV',
} as const;

/** A public configuration message built only from known setting names, never values. */
export class AuthConfigurationError extends AppError {
  constructor(fields: (keyof typeof settingNames)[]) {
    const names = [...new Set(fields)].map(field => settingNames[field]);
    super(
      `Discord login is not configured. 루트 .env 설정 확인: ${names.join(', ')}. 설정 후 BE를 재시작하세요. DISCORD_BOT_TOKEN은 웹 로그인 설정을 대신하지 않습니다.`,
      503,
    );
  }
}
