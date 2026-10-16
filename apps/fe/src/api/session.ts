let accessToken = '';
let recovery: (() => Promise<void>) | undefined;
let epoch = 0;
let recovering: { epoch: number; promise: Promise<void> } | undefined;
export function invalidateSession() {
  epoch++;
  accessToken = '';
}
export function getSessionEpoch() {
  return epoch;
}
export function setAccessToken(token: string) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setSessionRecovery(callback?: () => Promise<void>) {
  recovery = callback;
}
export function recoverAccessToken(): Promise<void> | undefined {
  if (!recovery) return undefined;
  if (!recovering || recovering.epoch !== epoch) {
    const callback = recovery;
    const promise = Promise.resolve()
      .then(callback)
      .finally(() => {
        if (recovering?.promise === promise) recovering = undefined;
      });
    recovering = { epoch, promise };
  }
  return recovering.promise;
}
export function decisionsQueryKey(guildId: string) {
  return ['decisions', guildId] as const;
}
