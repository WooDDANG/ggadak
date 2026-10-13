import { useQuery } from '@tanstack/react-query';
import { decisionsApi } from '../../api/decisions.api';
const states: Record<string, string> = {
  Draft: '검토 대기',
  Deferred: '보류',
  Decided: '확정',
  Rejected: '반려',
  Superseded: '교체됨',
};
export function CandidateHistory({ decisionId, guildId }: { decisionId: string; guildId: string }) {
  const history = useQuery({
    queryKey: ['candidate-history', guildId, decisionId],
    queryFn: async () => {
      const analyses = await decisionsApi.history(decisionId, guildId);
      const ids = [...new Set(analyses.flatMap(a => a.relatedCandidateIds))].filter(
        id => id !== decisionId,
      );
      const related = await Promise.all(ids.map(id => decisionsApi.detail(id, guildId)));
      return { analyses, related };
    },
    refetchInterval: 5000,
  });
  return (
    <details className="my-3 border border-slate-700 rounded p-3 text-sm">
      <summary className="cursor-pointer">관련 후보와 재분석 이력</summary>
      {history.isLoading && <p>이력을 불러오는 중입니다.</p>}
      {history.error && <p role="alert">관련 이력을 불러오지 못했습니다.</p>}
      {history.data?.analyses.map(a => (
        <p key={a.requestId} className="text-xs text-slate-400 mt-2">
          {new Date(a.createdAt).toLocaleString()} ·{' '}
          {a.isManualOverride ? '수동 재분석' : '자동 분석'}
          {a.previousRequestIds.length ? ' · 이전 분석과 연결됨' : ''}
        </p>
      ))}
      {history.data?.related.map(record => (
        <article key={record.id} className="mt-3 border-t border-slate-700 pt-2">
          <h4 className="font-semibold">
            {record.title || record.topic} · {states[record.state] || record.state}
          </h4>
          <p>{record.decisionContent || record.decision}</p>
          <p className="text-slate-400">{record.rationaleSummary || record.rationale}</p>
          {(record.actionItems || []).map(task => (
            <p key={task.id || task.task} className="text-xs">
              {task.task} ·{' '}
              {task.state === 'completed'
                ? '완료'
                : task.state === 'transferred'
                  ? '이전됨'
                  : task.state === 'canceled'
                    ? '취소됨'
                    : '완료 여부 검토 필요'}
            </p>
          ))}
        </article>
      ))}
    </details>
  );
}
