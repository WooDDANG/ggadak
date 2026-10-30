import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authorizeDiscord, logoutSession } from '../api/generated';
import type { DiscordGuild } from '../api/generated/model';
import { setAccessToken, setSessionRecovery, invalidateSession } from '../api/session';
import {
  broadcastSessionChange,
  chooseServer,
  finishDiscordLogin,
  isExpiredSession,
  observeSessionChanges,
  rememberServer,
  restoreBrowserLogin,
} from '../api/browser-session';

type Phase = 'loading' | 'signed-out' | 'ready' | 'reconnecting';
export function AuthGate({ children }: { children: (guildId: string) => React.ReactNode }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('loading');
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildId, setGuildId] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const revision = useRef(0);
  const currentUser = useRef('');
  const currentGuild = useRef('');
  const clear = useCallback(() => {
    revision.current++;
    currentUser.current = '';
    currentGuild.current = '';
    invalidateSession();
    setGuilds([]);
    setGuildId('');
    setUserId('');
    setPhase('signed-out');
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);
  const restore = useCallback(
    async (code?: string, state?: string) => {
      const attempt = ++revision.current;
      const background = !code && currentUser.current !== '';
      setError('');
      if (!background) {
        setPhase('loading');
        setAccessToken('');
        await queryClient.cancelQueries();
      }
      try {
        const session =
          code && state ? await finishDiscordLogin(code, state) : await restoreBrowserLogin();
        if (attempt !== revision.current) return;
        if (currentUser.current !== session.user.id) {
          invalidateSession();
          await queryClient.cancelQueries();
          if (attempt !== revision.current) return;
          queryClient.clear();
        }
        const selected = chooseServer(
          session.user.id,
          session.guilds,
          currentUser.current === session.user.id ? currentGuild.current : '',
        );
        currentUser.current = session.user.id;
        currentGuild.current = selected;
        setAccessToken(session.accessToken);
        setUserId(session.user.id);
        setGuilds(session.guilds);
        setGuildId(selected);
        if (selected) rememberServer(session.user.id, selected);
        setPhase('ready');
        if (code) broadcastSessionChange('login');
      } catch (failure) {
        if (attempt !== revision.current) return;
        if (isExpiredSession(failure)) clear();
        else {
          setAccessToken('');
          setPhase('reconnecting');
        }
        setError(
          isExpiredSession(failure) && !code
            ? ''
            : failure instanceof Error
              ? failure.message
              : '로그인 상태를 확인하지 못했습니다.',
        );
        throw failure;
      }
    },
    [clear, queryClient],
  );
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code'),
      state = query.get('state');
    if (code || query.has('error')) {
      if (!code || !state) {
        window.history.replaceState({}, '', window.location.pathname);
        setPhase('signed-out');
        setError('Discord 로그인을 취소했거나 로그인 요청이 만료됐습니다.');
      } else
        void restore(code, state)
          .catch(() => {})
          .finally(() => window.history.replaceState({}, '', window.location.pathname));
    } else {
      void restore().catch(() => {});
    }
    const onLogout = () => clear();
    window.addEventListener('ggaddak:logout', onLogout);
    const stop = observeSessionChanges(action => {
      if (action === 'logout') clear();
      else {
        clear();
        void restore().catch(() => {});
      }
    });
    setSessionRecovery(() => restore());
    return () => {
      revision.current++;
      setSessionRecovery();
      stop();
      window.removeEventListener('ggaddak:logout', onLogout);
    };
  }, [clear, restore]);
  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = window.setInterval(
      () => {
        void restore().catch(() => {});
      },
      10 * 60 * 1000,
    );
    const onFocus = () => {
      void restore().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [phase, restore]);
  useEffect(() => {
    const onOnline = () => {
      if (phase === 'reconnecting') void restore().catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [phase, restore]);
  const login = async () => {
    setError('');
    try {
      const response = await authorizeDiscord();
      window.location.assign(response.data.data.url);
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  const logout = async () => {
    try {
      await logoutSession();
      clear();
      broadcastSessionChange('logout');
    } catch (failure) {
      if (isExpiredSession(failure)) {
        clear();
        broadcastSessionChange('logout');
      } else setError('로그아웃을 완료하지 못했습니다. 연결을 확인하고 다시 시도하세요.');
    }
  };
  if (phase !== 'ready')
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl">까딱</h1>
        {phase === 'loading' ? (
          <p role="status">로그인과 서버 권한을 확인하는 중입니다.</p>
        ) : phase === 'reconnecting' ? (
          <>
            <p>일시적으로 로그인 상태를 확인할 수 없습니다. 서버 데이터 접근을 보류했습니다.</p>
            <button onClick={() => void restore().catch(() => {})}>다시 연결</button>
          </>
        ) : (
          <>
            <p>Discord 서버의 결정과 근거를 확인하세요.</p>
            <button onClick={() => void login()} className="bg-indigo-600 rounded px-5 py-3">
              Discord로 로그인
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <>
      <div className="bg-slate-900 text-slate-100 p-3 flex gap-3 items-center">
        <label htmlFor="guild">서버</label>
        <select
          id="guild"
          value={guildId}
          onChange={event => {
            setGuildId(event.target.value);
            currentGuild.current = event.target.value;
            rememberServer(userId, event.target.value);
          }}
          className="bg-slate-800 p-2"
        >
          {guilds.map(guild => (
            <option key={guild.id} value={guild.id}>
              {guild.name}
            </option>
          ))}
        </select>
        <button onClick={() => void logout()}>로그아웃</button>
        {error && <span role="alert">{error}</span>}
      </div>
      {guildId ? children(guildId) : <p className="p-8">접근 가능한 Discord 서버가 없습니다.</p>}
    </>
  );
}
