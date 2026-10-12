import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { decisionsApi } from '../../api/decisions.api';
import type { DecisionEditDto, V1DecisionDto } from '../../api/generated/model';

export function DecisionEditor({ card, guildId }: { card: V1DecisionDto; guildId: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DecisionEditDto>({
    expectedVersion: card.version ?? 1,
    title: card.title || card.topic,
    decision: card.decisionContent || card.decision,
    rationale: card.rationale,
    category: card.categoryTag ?? '기타',
    alternatives: card.alternatives,
  });
  const save = useMutation({
    mutationFn: () => decisionsApi.edit(card.id, guildId, form),
    onSuccess: async () => {
      setEditing(false);
      await client.invalidateQueries({ queryKey: ['decision-detail', guildId, card.id] });
      await client.invalidateQueries({ queryKey: ['decision-cards', guildId] });
    },
  });
  if (card.status === 'SUPERSEDED' || card.status === 'DISCARDED') return null;
  if (!editing)
    return (
      <button
        onClick={() => {
          setForm({
            expectedVersion: card.version ?? 1,
            title: card.title || card.topic,
            decision: card.decisionContent || card.decision,
            rationale: card.rationale,
            category: card.categoryTag ?? '기타',
            alternatives: card.alternatives,
          });
          save.reset();
          setEditing(true);
        }}
      >
        편집
      </button>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="block">
        요약
        <input
          className="block bg-slate-800 w-full"
          required
          maxLength={200}
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block">
        결정 내용
        <textarea
          className="block bg-slate-800 w-full"
          required
          maxLength={10000}
          value={form.decision}
          onChange={e => setForm({ ...form, decision: e.target.value })}
        />
      </label>
      <label className="block">
        Rationale
        <textarea
          className="block bg-slate-800 w-full"
          required
          maxLength={10000}
          value={form.rationale}
          onChange={e => setForm({ ...form, rationale: e.target.value })}
        />
      </label>
      <label>
        카테고리
        <select
          className="bg-slate-800"
          value={form.category}
          onChange={e =>
            setForm({ ...form, category: e.target.value as DecisionEditDto['category'] })
          }
        >
          {['타깃', '문제정의', '기능', '기술', 'BM', '기타'].map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {form.alternatives.map((a, i) => (
        <fieldset key={a.id || i}>
          <legend>대안 {i + 1}</legend>
          <input
            aria-label={`대안 ${i + 1} 이름`}
            className="bg-slate-800"
            required
            maxLength={200}
            value={a.name}
            onChange={e =>
              setForm({
                ...form,
                alternatives: form.alternatives.map((v, n) =>
                  n === i ? { ...v, name: e.target.value } : v,
                ),
              })
            }
          />
          <textarea
            aria-label={`대안 ${i + 1} 이유`}
            className="bg-slate-800"
            required
            maxLength={2000}
            value={a.reason}
            onChange={e =>
              setForm({
                ...form,
                alternatives: form.alternatives.map((v, n) =>
                  n === i ? { ...v, reason: e.target.value } : v,
                ),
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              setForm({ ...form, alternatives: form.alternatives.filter((_, n) => n !== i) })
            }
          >
            삭제
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={form.alternatives.length >= 20}
        onClick={() =>
          setForm({ ...form, alternatives: [...form.alternatives, { name: '', reason: '' }] })
        }
      >
        대안 추가
      </button>
      {save.error && (
        <p role="alert">
          {save.error.message} 현재 내용을 다시 불러온 후 편집하세요.
          <button
            type="button"
            onClick={() =>
              client.invalidateQueries({ queryKey: ['decision-detail', guildId, card.id] })
            }
          >
            다시 불러오기
          </button>
        </p>
      )}
      <button disabled={save.isPending}>저장</button>
      <button type="button" disabled={save.isPending} onClick={() => setEditing(false)}>
        취소
      </button>
    </form>
  );
}
