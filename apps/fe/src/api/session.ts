let accessToken = '';
let recovery: (() => Promise<void>) | undefined;
let epoch = 0;
let recovering: { epoch: number; promise: Promise<void> } | undefined;
let permissionRecovery: (() => Promise<void>) | undefined;
let recoveringPermissions: { epoch: number; promise: Promise<void> } | undefined;
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
export function setPermissionRecovery(callback?: () => Promise<void>) {
  permissionRecovery = callback;
}
export function recoverGuildPermissions(): Promise<void> | undefined {
  if (!permissionRecovery) return undefined;
  if (!recoveringPermissions || recoveringPermissions.epoch !== epoch) {
    const pending = permissionRecovery();
    const promise = pending.finally(() => {
      if (recoveringPermissions?.promise === promise) recoveringPermissions = undefined;
    });
    recoveringPermissions = { epoch, promise };
  }
  return recoveringPermissions.promise;
}
export function decisionsQueryKey(guildId: string) {
  return ['decisions', guildId] as const;
}
