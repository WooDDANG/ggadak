import { useState } from 'react';
import type { Decision, ReviewAction } from '@ggaddak/shared';

interface Props {
  candidate: Decision;
  records: Decision[];
  disabled: boolean;
  onConfirm: (action: ReviewAction) => Promise<void>;
}

/** Keep the selected predecessor snapshot: polling must not silently accept a newer version. */
export function ReviewResolution({ candidate, records, disabled, onConfirm }: Props) {
  const [predecessor, setPredecessor] = useState<Decision | null>(null);
  const [choices, setChoices] = useState<
    Record<string, { classification?: 'open' | 'completed'; disposition?: 'cancel' | 'transfer' }>
  >({});
  const eligible = records.filter(
    record => record.state === 'Decided' && record.id !== candidate.id,
  );
  const tasks = predecessor?.actionItems ?? [];
  const complete = tasks.every(task => {
    if (!task.id) return false;
    const choice = choices[task.id];
    const state = task.state === 'unknown' || !task.state ? choice?.classification : task.state;
    return state !== undefined && (state !== 'open' || choice?.disposition !== undefined);
  });
  const update = (id: string, choice: (typeof choices)[string]) =>
    setChoices(old => ({ ...old, [id]: choice }));
  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-300">
        확정 방식
        <select
          aria-label={`${candidate.title ?? candidate.topic} 확정 방식`}
          value={predecessor?.id ?? ''}
          disabled={disabled}
          className="block bg-slate-900 rounded p-2 max-w-64"
          onChange={event => {
            setPredecessor(eligible.find(record => record.id === event.target.value) ?? null);
            setChoices({});
          }}
        >
          <option value="">독립적으로 확정</option>
          {eligible.map(record => (
            <option key={record.id} value={record.id}>
              교체: {record.title ?? record.topic} ({record.id})
            </option>
          ))}
        </select>
      </label>
      {predecessor && (
        <div className="text-xs space-y-2 max-w-sm">
          <p>기존 결정 v{predecessor.version}을 교체합니다. 완료 이력은 보존됩니다.</p>
          {tasks.map(task => (
            <div key={task.id} className="border border-slate-700 p-2 rounded">
              <p>
                {task.task} {task.assignee && `(${task.assignee})`}
              </p>
              {(task.state === 'unknown' || !task.state) && (
                <select
                  aria-label={`${task.task} 완료 상태`}
                  disabled={disabled}
                  value={choices[task.id!]?.classification ?? ''}
                  className="bg-slate-900 p-1"
                  onChange={event =>
                    update(task.id!, {
                      classification: event.target.value
                        ? (event.target.value as 'open' | 'completed')
                        : undefined,
                    })
                  }
                >
                  <option value="">완료 여부 선택</option>
                  <option value="open">미완료</option>
                  <option value="completed">완료</option>
                </select>
              )}
              {(task.state === 'open' || choices[task.id!]?.classification === 'open') && (
                <select
                  aria-label={`${task.task} 처리`}
                  disabled={disabled}
                  value={choices[task.id!]?.disposition ?? ''}
                  className="bg-slate-900 p-1"
                  onChange={event =>
                    update(task.id!, {
                      ...choices[task.id!],
                      disposition: event.target.value
                        ? (event.target.value as 'cancel' | 'transfer')
                        : undefined,
                    })
                  }
                >
                  <option value="">처리 선택</option>
                  <option value="cancel">취소</option>
                  <option value="transfer">새 결정으로 이전</option>
                </select>
              )}
              {task.state === 'completed' && <span>완료 · 기존 결정에 보존</span>}
            </div>
          ))}
        </div>
      )}
      <button
        disabled={
          disabled ||
          candidate.version === undefined ||
          (predecessor !== null && (!complete || predecessor.version === undefined))
        }
        className="px-3.5 py-2 bg-emerald-600 rounded-xl text-xs font-semibold disabled:opacity-40"
        onClick={() =>
          onConfirm({
            action: 'confirm',
            expectedVersion: candidate.version!,
            resolution: predecessor ? 'replace' : 'independent',
            ...(predecessor
              ? {
                  predecessorId: predecessor.id,
                  predecessorVersion: predecessor.version,
                  taskDispositions: Object.entries(choices)
                    .filter(([, choice]) => choice.classification || choice.disposition)
                    .map(([actionItemId, choice]) => ({ actionItemId, ...choice })),
                }
              : {}),
          })
        }
      >
        {predecessor ? '교체 확정' : '확정'}
      </button>
    </div>
  );
}
