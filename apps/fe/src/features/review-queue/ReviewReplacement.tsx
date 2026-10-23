import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Decision, ReviewAction } from '@ggaddak/shared';
import { decisionsApi } from '../../api/decisions.api';
import { ReviewResolution } from './ReviewResolution';
import { PageControls } from './PageControls';

export function ReviewReplacement({
  candidate,
  guildId,
  disabled,
  onConfirm,
}: {
  candidate: Decision;
  guildId: string;
  disabled: boolean;
  onConfirm: (action: ReviewAction) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['review-replacements', guildId, page],
    enabled: open,
    queryFn: ({ signal }) =>
      decisionsApi.recordPage({ guildId, status: 'CONFIRMED', page }, signal),
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.pageInfo.totalPages))
      setPage(Math.max(1, query.data.pageInfo.totalPages));
  }, [query.data, page]);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="text-xs text-indigo-300"
      >
        {open ? '교체 대상 목록 닫기' : '교체할 기존 결정 찾기'}
      </button>
      {open && (
        <>
          {query.isLoading && <p role="status">확정된 결정을 불러오는 중입니다.</p>}
          {query.error && (
            <p role="alert">
              교체 대상을 불러오지 못했습니다.{' '}
              <button onClick={() => void query.refetch()}>다시 시도</button>
            </p>
          )}
          {query.data && (
            <PageControls
              page={page}
              {...query.data.pageInfo}
              onPage={setPage}
              busy={query.isFetching || disabled}
            />
          )}
        </>
      )}
      <ReviewResolution
        candidate={candidate}
        records={query.data?.items ?? []}
        disabled={disabled}
        onConfirm={onConfirm}
      />
    </div>
  );
}
