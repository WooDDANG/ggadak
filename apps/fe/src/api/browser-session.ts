import { restoreBrowserSession, loginDiscord } from './generated';
import { unwrapApiResponse } from './api-response';
import { ApiHttpError } from './transport';
import { getSessionEpoch } from './session';
import type { DiscordGuild } from './generated/model';

let restoring: { epoch: number; promise: ReturnType<typeof restore> } | undefined;
async function restore() {
  return unwrapApiResponse(await restoreBrowserSession());
}
export function restoreBrowserLogin() {
  const epoch = getSessionEpoch();
  if (!restoring || restoring.epoch !== epoch) {
    const promise = restore().finally(() => {
      if (restoring?.promise === promise) restoring = undefined;
    });
    restoring = { epoch, promise };
  }
  return restoring.promise;
}
let callback: { key: string; promise: ReturnType<typeof loginDiscord> } | undefined;
export async function finishDiscordLogin(code: string, state: string) {
  const key = `${code}:${state}`;
  if (callback?.key !== key) callback = { key, promise: loginDiscord({ code, state }) };
  await callback.promise;
  return restoreBrowserLogin();
}
export function isExpiredSession(error: unknown) {
  return error instanceof ApiHttpError && error.status === 401;
}
export function rememberServer(userId: string, guildId: string) {
  try {
    localStorage.setItem(`ggaddak:server:${userId}`, guildId);
  } catch {
    /* Storage can be unavailable. */
  }
}
export function chooseServer(userId: string, guilds: DiscordGuild[], current = '') {
  let remembered = '';
  try {
    remembered = localStorage.getItem(`ggaddak:server:${userId}`) || '';
  } catch {
    /* Use the first permitted server. */
  }
  return (
    [current, remembered].find(id => guilds.some(guild => guild.id === id)) || guilds[0]?.id || ''
  );
}
const signalKey = 'ggaddak:auth-event';
const tabId = crypto.randomUUID();
export function broadcastSessionChange(action: 'logout' | 'login') {
  const event = { action, source: tabId, nonce: crypto.randomUUID() };
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(signalKey);
      channel.postMessage(event);
      channel.close();
      return;
    }
  } catch {
    /* Fall back to storage events. */
  }
  try {
    localStorage.setItem(signalKey, JSON.stringify(event));
  } catch {
    /* Session revocation is still enforced by BE. */
  }
}
export function observeSessionChanges(listener: (action: 'logout' | 'login') => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== signalKey || !event.newValue) return;
    try {
      const value = JSON.parse(event.newValue);
      if (value.action === 'logout' || value.action === 'login') listener(value.action);
    } catch {
      /* Ignore unrelated malformed storage values. */
    }
  };
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(signalKey);
      channel.onmessage = event => {
        const value = event.data;
        if (value?.source !== tabId && (value?.action === 'logout' || value?.action === 'login'))
          listener(value.action);
      };
    }
  } catch {
    /* Storage events remain available when BroadcastChannel is blocked. */
  }
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
