import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {decisionsApi} from '../../api/decisions.api';
import type {DecisionStatus} from '../../api/generated/model';

export function DecisionBrowser({guildId}: {guildId: string}) {
  const [status, setStatus] = useState<DecisionStatus | ''>('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({queryKey:['decision-cards', guildId, status, category, page], queryFn:() => decisionsApi.browse({guildId, status: status || undefined, category: category || undefined, page, size:20})});
  const detail = useQuery({queryKey:['decision-detail', guildId, selected], queryFn:() => decisionsApi.detail(selected!, guildId), enabled:!!selected});
  return <section className="space-y-4">
    <h2 className="text-xl font-bold">결정 카드</h2>
    <div className="flex gap-3">
      <select aria-label="결정 상태" className="bg-slate-800 p-2" value={status} onChange={e=>{setStatus(e.target.value as DecisionStatus | '');setPage(1);}}>
        <option value="">모든 상태</option><option value="IN_REVIEW">검토 대기</option><option value="CONFIRMED">확정</option><option value="ON_HOLD">보류</option><option value="DISCARDED">반려</option><option value="SUPERSEDED">대체된 이력</option>
      </select>
      <select aria-label="카테고리" className="bg-slate-800 p-2" value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">모든 카테고리</option>{['타깃','문제정의','기능','기술','BM','기타'].map(c=><option key={c}>{c}</option>)}</select>
    </div>
    {list.isLoading && <p role="status">불러오는 중...</p>}
    {list.error && <p role="alert">{list.error.message}</p>}
    {list.data?.items.length === 0 && <p>조건에 맞는 결정이 없습니다.</p>}
    {list.data?.items.map(card=><article key={card.id} className="bg-slate-800 rounded-xl p-4 space-y-2"><h3>{card.title || card.topic}</h3><p>{card.decisionContent || card.decision}</p><p>{card.rationaleSummary || card.rationale}</p><span>{card.category} · {card.status} · {card.confirmedDate ? new Date(card.confirmedDate).toLocaleDateString() : '확정일 미기록'}</span><button className="block text-indigo-300" onClick={()=>setSelected(card.id)}>상세 보기</button></article>)}
    <div className="flex gap-4"><button disabled={page === 1} onClick={()=>setPage(page-1)}>이전</button><span>{page} / {list.data?.pageInfo.totalPages || 1}</span><button disabled={!list.data || page >= list.data.pageInfo.totalPages} onClick={()=>setPage(page+1)}>다음</button></div>
    {selected && <aside aria-label="결정 상세" className="bg-slate-900 border border-slate-700 p-4 space-y-3"><button onClick={()=>setSelected(null)}>닫기</button>{detail.isLoading && <p>불러오는 중...</p>}{detail.error && <p role="alert">{detail.error.message}</p>}{detail.data && <><h3>{detail.data.title || detail.data.topic}</h3><p>{detail.data.rationale}</p><p>ID: {detail.data.id} · 버전: {detail.data.version}</p><p>이전 결정: {detail.data.supersedesId || '없음'} · 대체 결정: {detail.data.supersededById || '없음'}</p>{detail.data.alternatives.map(a=><p key={a.id}>대안: {a.name} — {a.reason}</p>)}{detail.data.actionItems?.map(a=><p key={a.id}>후속 작업: {a.task} ({a.state})</p>)}{detail.data.rationaleQuotes?.map((q,i)=><blockquote key={i}>{q}</blockquote>)}{detail.data.source?.messageUrl && <a href={String(detail.data.source.messageUrl)} target="_blank" rel="noreferrer">Discord 원문</a>}</>}</aside>}
  </section>;
}
