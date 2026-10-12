import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../api/search.api';
import { decisionsApi } from '../api/decisions.api';

export function WhySearch({ guildId }: { guildId: string }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const results = useQuery({
    queryKey: ['why-search', guildId, query],
    queryFn: () => searchApi.search(guildId, query),
    enabled: !!query,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['decision-detail', guildId, selected],
    queryFn: () => decisionsApi.detail(selected!, guildId),
    enabled: !!selected,
  });
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Why · 결정 근거 검색</h2>
      <p>확정된 결정과 대체된 이력에서 질문과 관련된 근거를 찾습니다.</p>
      <form
        className="flex gap-3"
        onSubmit={e => {
          e.preventDefault();
          setSelected(null);
          if (input.trim() === query) results.refetch();
          else setQuery(input.trim());
        }}
      >
        <input
          aria-label="결정에 관한 질문"
          className="flex-1 rounded bg-slate-800 p-3"
          maxLength={1000}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="왜 이 인증 방식을 선택했나요?"
        />
        <button
          className="rounded bg-indigo-600 px-4"
          disabled={!input.trim() || results.isFetching}
        >
          검색
        </button>
      </form>
      {results.isFetching && <p role="status">관련 결정과 근거를 찾는 중...</p>}
      {results.error && (
        <div role="alert">
          <p>{results.error.message}</p>
          <button onClick={() => results.refetch()}>다시 시도</button>
        </div>
      )}
      {results.data?.items.length === 0 && <p>관련 결정이 없습니다.</p>}
      {results.data?.items.map(result => (
        <article key={result.decision.id} className="rounded-xl bg-slate-800 p-4 space-y-2">
          <h3>{result.decision.title || result.decision.topic}</h3>
          <p>{result.decision.decisionContent || result.decision.decision}</p>
          <blockquote>{result.excerpt}</blockquote>
          <p>
            유사도 {result.score.toFixed(3)} · {result.decision.status}
          </p>
          <button className="text-indigo-300 mr-4" onClick={() => setSelected(result.decision.id)}>
            결정 카드 보기
          </button>
          {result.sourceUrl && (
            <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-300">
              Discord 원문
            </a>
          )}
        </article>
      ))}
      {selected && (
        <aside
          aria-label="검색한 결정 카드"
          className="p-4 border border-slate-700 rounded-xl space-y-2"
        >
          <button onClick={() => setSelected(null)}>닫기</button>
          {detail.isLoading && <p role="status">카드 불러오는 중...</p>}
          {detail.error && <p role="alert">{detail.error.message}</p>}
          {detail.data && (
            <>
              <h3>{detail.data.title || detail.data.topic}</h3>
              <p>{detail.data.decisionContent || detail.data.decision}</p>
              <p>{detail.data.rationaleSummary || detail.data.rationale}</p>
              {detail.data.rationaleQuotes?.map((quote, i) => (
                <blockquote key={i}>{quote}</blockquote>
              ))}
              <p>
                이전 결정: {detail.data.supersedesId || '없음'} · 대체 결정:{' '}
                {detail.data.supersededById || '없음'}
              </p>
              {detail.data.source?.messageUrl && (
                <a href={String(detail.data.source?.messageUrl)} target="_blank" rel="noreferrer">
                  Discord 원문
                </a>
              )}
            </>
          )}
        </aside>
      )}
    </section>
  );
}
