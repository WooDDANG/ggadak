import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decisionsApi } from '../../api/decisions.api';
import { QueryPolicy } from '../../config';
import { ReviewHistory } from './ReviewHistory';
import { PageControls } from './PageControls';

export function PagedReviewHistory({ guildId }: { guildId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'CONFIRMED' | 'DISCARDED' | 'SUPERSEDED'>('CONFIRMED');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['review-history', guildId, status, page],
    enabled: open,
    queryFn: ({ signal }) => decisionsApi.recordPage({ guildId, status, page }, signal),
    refetchInterval: open ? QueryPolicy.reviewPollMs : false,
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.pageInfo.totalPages))
      setPage(Math.max(1, query.data.pageInfo.totalPages));
  }, [query.data, page]);
  return (
    <details
      className="my-6 rounded border border-slate-700 p-4"
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer">확정·반려 이력 조회</summary>
      <label>
        결정 상태{' '}
        <select
          value={status}
          onChange={event => {
            setStatus(event.target.value as typeof status);
            setPage(1);
          }}
          className="bg-slate-800 p-2"
        >
          <option value="CONFIRMED">확정</option>
          <option value="DISCARDED">반려</option>
          <option value="SUPERSEDED">교체됨</option>
        </select>
      </label>
      {query.isLoading && <p role="status">이력을 불러오는 중입니다.</p>}
      {query.error && (
        <p role="alert">
          이력을 불러오지 못했습니다.{' '}
          <button onClick={() => void query.refetch()}>다시 시도</button>
        </p>
      )}
      {query.data && (
        <>
          <PageControls
            page={page}
            {...query.data.pageInfo}
            onPage={setPage}
            busy={query.isFetching}
          />
          {!query.data.items.length && <p>해당 상태의 결정이 없습니다.</p>}
          <ReviewHistory records={query.data.items} guildId={guildId} />
        </>
      )}
    </details>
  );
}
