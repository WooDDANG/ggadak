import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decisionsApi } from '../../api/decisions.api';
import type { DecisionTimelineGroupBy } from '../../api/generated/model';

const groups: { value: DecisionTimelineGroupBy; label: string }[] = [
  { value: 'month', label: '월별' },
  { value: 'topic', label: '주제별' },
  { value: 'channel', label: '채널별' },
  { value: 'category', label: '카테고리별' },
];

export function DecisionBrowser({ guildId }: { guildId: string }) {
  const [groupBy, setGroupBy] = useState<DecisionTimelineGroupBy>('month');
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [selected, setSelected] = useState<string | null>(null);
  const timeline = useQuery({
    queryKey: ['decision-timeline', guildId, groupBy, timezone],
    queryFn: () => decisionsApi.timeline({ guildId, groupBy, timezone }),
  });
  const detail = useQuery({
    queryKey: ['decision-detail', guildId, selected],
    queryFn: () => decisionsApi.detail(selected!, guildId),
    enabled: !!selected,
  });

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold">확정 결정 타임라인</h2>
        <p className="text-sm text-slate-400">확정 시각 기준 · {timezone}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">그룹
        <select aria-label="타임라인 그룹" className="bg-slate-800 p-2 rounded" value={groupBy} onChange={e => setGroupBy(e.target.value as DecisionTimelineGroupBy)}>
          {groups.map(group => <option key={group.value} value={group.value}>{group.label}</option>)}
        </select>
      </label>
    </div>
    {timeline.isLoading && <p role="status">확정 결정을 불러오는 중...</p>}
    {timeline.error && <p role="alert">{timeline.error.message}</p>}
    {timeline.data?.totalElements === 0 && <p className="rounded-xl bg-slate-800 p-8 text-center text-slate-400">확정일이 기록된 결정이 없습니다.</p>}
    <div className="space-y-8">
      {timeline.data?.groups.map(group => <section key={group.key} aria-label={`${group.key} 결정`} className="space-y-3">
        <h3 className="border-b border-slate-700 pb-2 font-semibold text-slate-200">{group.key}<span className="ml-2 text-xs text-slate-400">{group.count}건</span></h3>
        <div className="grid gap-3">
          {group.items.map(card => <article key={card.id} className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
              <span>{card.category} · 확정</span>
              <time dateTime={card.confirmedDate ?? undefined}>{card.confirmedDate ? new Date(card.confirmedDate).toLocaleString(undefined, { timeZone: timezone }) : '확정일 미기록'}</time>
            </div>
            <h4 className="font-semibold">{card.title || card.topic}</h4>
            <p>{card.decisionContent || card.decision}</p>
            <p className="text-sm text-slate-300">{card.rationaleSummary || card.rationale}</p>
            <button className="text-sm text-indigo-300 hover:text-indigo-200" onClick={() => setSelected(card.id)}>상세 보기</button>
          </article>)}
        </div>
      </section>)}
    </div>
    {selected && <aside aria-label="결정 상세" className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
      <button className="text-sm text-indigo-300" onClick={() => setSelected(null)}>닫기</button>
      {detail.isLoading && <p role="status">상세 정보를 불러오는 중...</p>}
      {detail.error && <p role="alert">{detail.error.message}</p>}
      {detail.data && <>
        <h3 className="text-lg font-semibold">{detail.data.title || detail.data.topic}</h3>
        <p>{detail.data.decisionContent || detail.data.decision}</p>
        <p>{detail.data.rationale}</p>
        <p className="text-xs text-slate-400">확정 시각: {detail.data.confirmedDate ? new Date(detail.data.confirmedDate).toLocaleString(undefined, { timeZone: timezone }) : '미기록'}</p>
        <p className="text-xs text-slate-400">ID: {detail.data.id} · 버전: {detail.data.version}</p>
        {detail.data.actionItems?.map(item => <p key={item.id}>후속 작업: {item.task} ({item.state})</p>)}
        {detail.data.rationaleQuotes?.map((quote, index) => <blockquote key={index} className="border-l-2 border-indigo-500 pl-3">{quote}</blockquote>)}
        {detail.data.source?.messageUrl && <a className="text-indigo-300" href={String(detail.data.source.messageUrl)} target="_blank" rel="noreferrer">Discord 원문</a>}
      </>}
    </aside>}
  </section>;
}
