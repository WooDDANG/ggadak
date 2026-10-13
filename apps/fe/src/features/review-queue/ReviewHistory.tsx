import { useState } from 'react';
import type { Decision } from '@ggaddak/shared';
import { CandidateHistory } from './CandidateHistory';
const states: Record<string, string> = { Decided: '확정', Rejected: '반려', Superseded: '교체됨' };
export function ReviewHistory({ records, guildId }: { records: Decision[]; guildId?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const history = records.filter(record =>
    ['Decided', 'Rejected', 'Superseded'].includes(record.state),
  );
  if (!history.length) return null;
  return (
    <section className="mt-6 space-y-3" aria-label="확정·반려 이력">
      <h3 className="text-lg font-semibold">확정·반려 이력</h3>
      {history.map(record => (
        <details
          key={record.id}
          open={expanded === record.id}
          className="border border-slate-700 rounded-xl p-4"
          onToggle={event => {
            const open = event.currentTarget.open;
            setExpanded(old => (open ? record.id : old === record.id ? null : old));
          }}
        >
          <summary className="cursor-pointer">
            {record.title || record.topic} · {states[record.state]}
          </summary>
          {expanded === record.id && (
            <div className="mt-3 space-y-2 text-sm">
              <p>{record.decisionContent || record.decision}</p>
              <p className="text-slate-400">{record.rationaleSummary || record.rationale}</p>
              {record.actionItems.map(task => (
                <p key={task.id || task.task}>
                  {task.task} ·{' '}
                  {task.state === 'completed'
                    ? '완료'
                    : task.state === 'transferred'
                      ? '이전됨'
                      : task.state === 'canceled'
                        ? '취소됨'
                        : '완료 여부 미확인'}
                </p>
              ))}
              {guildId && <CandidateHistory decisionId={record.id} guildId={guildId} />}
            </div>
          )}
        </details>
      ))}
    </section>
  );
}
