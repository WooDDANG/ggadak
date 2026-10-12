import React, { useEffect, useState } from 'react';
import { authorizeDiscord, loginDiscord, listAuthGuilds, logoutSession, refreshSession } from '../api/generated';
import type { DiscordGuild } from '../api/generated/model';
import { setAccessToken } from '../api/session';
let callbackLogin: { key: string; promise: ReturnType<typeof loginDiscord> } | undefined;
export function AuthGate({ children }: { children: (guildId: string) => React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildId, setGuildId] = useState('');
  const [error, setError] = useState('');
  const loadGuilds = async () => {
    const response = await listAuthGuilds();
    const available = response.data.data.guilds;
    setGuilds(available); setGuildId(previous => available.some(g => g.id === previous) ? previous : available[0]?.id ?? '');
  };
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code'); const state = query.get('state');
    if (code || query.has('error')) {

      if (!code || !state) { setError('Discord 로그인을 취소했거나 로그인 요청이 만료됐습니다.'); return; }
      const key = `${code}:${state}`;
      if (callbackLogin?.key !== key) callbackLogin = { key, promise: loginDiscord({ code, state }) };
      callbackLogin.promise.then(async response => {
        if (!active) return;
        window.history.replaceState({}, '', window.location.pathname);
        setAccessToken(response.data.data.accessToken); await loadGuilds(); setSignedIn(true);
      }).catch(e => { if (active) { window.history.replaceState({}, '', window.location.pathname); setError(e.message); } });
    }
    const clear = () => { setSignedIn(false); setGuilds([]); setGuildId(''); };
    window.addEventListener('ggaddak:logout', clear);
    return () => { active = false; window.removeEventListener('ggaddak:logout', clear); };
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setInterval(async () => {
      try { const response = await refreshSession(); setAccessToken(response.data.data.accessToken); await loadGuilds(); }
      catch (e) { setError((e as Error).message); setAccessToken(''); setSignedIn(false); }
    }, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [signedIn]);
  const login = async () => {
    try { const response = await authorizeDiscord(); window.location.assign(response.data.data.url); }
    catch (e) { setError((e as Error).message); }
  };
  const logout = async () => {
    try { await logoutSession(); } finally { setAccessToken(''); setSignedIn(false); setGuildId(''); setGuilds([]); }
  };
  if (!signedIn) return <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4"><h1 className="text-2xl">까닭</h1><p>Discord 서버의 결정과 근거를 확인하세요.</p><button onClick={login} className="bg-indigo-600 rounded px-5 py-3">Discord로 로그인</button>{error && <p role="alert">{error}</p>}</main>;
  return <><div className="bg-slate-900 text-slate-100 p-3 flex gap-3 items-center"><label htmlFor="guild">서버</label><select id="guild" value={guildId} onChange={e => setGuildId(e.target.value)} className="bg-slate-800 p-2">{guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select><button onClick={logout}>로그아웃</button>{error && <span role="alert">{error}</span>}</div>{guildId ? children(guildId) : <p className="p-8">접근 가능한 Discord 서버가 없습니다.</p>}</>;
}
