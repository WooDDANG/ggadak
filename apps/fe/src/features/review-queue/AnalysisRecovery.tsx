import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { recoveryApi } from '../../api/recovery.api';

type Command = {
  id: string;
  phase: 'requesting' | 'pending' | 'acknowledged' | 'error';
  error?: string;
};
const categories: Record<string, string> = {
  'analysis-in-progress': '서버에서 분석 진행 중',
  'backend-unavailable': '분석 서버 연결 오류',
  'configuration-or-payload': '분석 설정 확인 필요',
  'invalid-result': '분석 결과 확인 필요',
  'network-or-timeout': '연결 지연 또는 시간 초과',
};

export function AnalysisRecovery({ guildId }: { guildId: string }) {
  const [commands, setCommands] = useState<Record<string, Command>>({});
  const queue = useQuery({
    queryKey: ['analysis-deliveries', guildId],
    queryFn: () => recoveryApi.list(guildId),
    refetchInterval: 5000,
  });
  const pending = Object.entries(commands).filter(([, command]) => command.phase === 'pending');
  const acknowledgements = useQuery({
    queryKey: ['analysis-retries', guildId, pending.map(([, command]) => command.id).join(',')],
    enabled: pending.length > 0,
    queryFn: async () => {
      await Promise.all(
        pending.map(async ([requestId, command]) => {
          const result = await recoveryApi.retry(guildId, requestId, command.id);
          if (result.acknowledgedAt)
            setCommands(old => ({
              ...old,
              [requestId]: { ...command, id: result.id, phase: 'acknowledged' },
            }));
        }),
      );
      return true;
    },
    refetchInterval: 2000,
  });
  const retry = async (requestId: string) => {
    const previous = commands[requestId];
    const command: Command = {
      id: previous?.phase === 'error' ? previous.id : crypto.randomUUID(),
      phase: 'requesting',
    };
    setCommands(old => ({ ...old, [requestId]: command }));
    try {
      const result = await recoveryApi.retry(guildId, requestId, command.id);
      setCommands(old => ({
        ...old,
        [requestId]: {
          ...command,
          id: result.id,
          phase: result.acknowledgedAt ? 'acknowledged' : 'pending',
        },
      }));
      await queue.refetch();
    } catch (error) {
      setCommands(old => ({
        ...old,
        [requestId]: {
          ...command,
          phase: 'error',
          error: error instanceof Error ? error.message : '재시도 요청에 실패했습니다.',
        },
      }));
    }
  };
  const retained =
    queue.data?.requests.filter(r =>
      ['pending', 'retry-pending', 'retained-failure'].includes(r.status),
    ) || [];
  return (
    <section
      className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-3"
      aria-label="분석 복구"
    >
      <h2 className="font-semibold text-white">분석 복구</h2>
      {queue.isLoading && <p role="status">분석 상태를 불러오는 중입니다.</p>}
      {(queue.error || !queue.data?.available) && !queue.isLoading && (
        <p role="alert" className="text-amber-300">
          봇의 최신 상태를 확인할 수 없습니다. 연결이 복구될 때까지 재시도를 시작할 수 없습니다.
        </p>
      )}
      {queue.data?.lastSynchronizedAt && (
        <p className="text-xs text-slate-400">
          마지막 연결 확인: {new Date(queue.data.lastSynchronizedAt).toLocaleString()}
        </p>
      )}
      {queue.data?.available && retained.length === 0 && (
        <p className="text-sm text-slate-400">대기 중이거나 실패한 분석이 없습니다.</p>
      )}
      {acknowledgements.error && (
        <p role="alert">재시도 접수 상태를 확인하지 못했습니다. 연결 복구 후 다시 확인합니다.</p>
      )}
      {retained.map(request => {
        const command = commands[request.requestId];
        const pendingCommand = command && ['requesting', 'pending'].includes(command.phase);
        return (
          <div key={request.requestId} className="border-t border-slate-700 pt-3 space-y-2 text-sm">
            {request.channelName && <p className="font-medium">#{request.channelName}</p>}
            <p>
              {request.status === 'retained-failure'
                ? '분석 실패 · 확인 필요'
                : '분석 대기 · 자동 재시도 예정'}{' '}
              · 시도 {request.attempts}회
            </p>
            {request.errorCategory && (
              <p className="text-slate-400">
                {categories[request.errorCategory] || '분석을 완료하지 못했습니다.'}
              </p>
            )}
            {request.scanRange && (
              <p className="text-xs text-slate-400">
                채널 스캔의 미완료 구간입니다. 복구 전까지 다음 구간의 진행률을 확정하지 않습니다.
              </p>
            )}
            {command && (
              <p role={command.phase === 'error' ? 'alert' : 'status'}>
                {command.phase === 'requesting'
                  ? '재시도 요청 중…'
                  : command.phase === 'pending'
                    ? '재시도 접수됨 · 봇의 확인 대기 중'
                    : command.phase === 'acknowledged'
                      ? '봇이 재시도를 확인했습니다. 분석 결과를 기다리세요.'
                      : command.error}
              </p>
            )}
            <button
              className="bg-indigo-600 px-3 py-2 rounded disabled:opacity-40"
              disabled={
                !queue.data?.available ||
                !!queue.error ||
                !!pendingCommand ||
                request.status !== 'retained-failure'
              }
              onClick={() => void retry(request.requestId)}
            >
              재시도
            </button>
          </div>
        );
      })}
    </section>
  );
}
