let accessToken = '';
export function setAccessToken(token: string) { accessToken = token; }
export function getAccessToken() { return accessToken; }
export function decisionsQueryKey(guildId: string) { return ['decisions', guildId] as const; }
