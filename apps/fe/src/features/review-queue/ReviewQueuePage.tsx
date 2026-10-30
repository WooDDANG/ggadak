import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewAction } from '@ggaddak/shared';
import { decisionsApi } from '../../api/decisions.api';
import { decisionsQueryKey } from '../../api/session';
import { dashboardQueryKey } from '../../api/dashboard.api';
import { reviewWithConflictReload } from '../../api/review-workflow';
import { QueryPolicy } from '../../config';
import { ReviewQueue } from './ReviewQueue';
import { PageControls } from './PageControls';
import { PagedReviewHistory } from './PagedReviewHistory';
import { AnalysisRecovery } from './AnalysisRecovery';

export function ReviewQueuePage({ guildId }: { guildId: string }) {
  const [status, setStatus] = useState<'IN_REVIEW' | 'ON_HOLD'>('IN_REVIEW');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: [...decisionsQueryKey(guildId), 'review-queue', status, page],
    queryFn: ({ signal }) => decisionsApi.reviewPage(guildId, status, page, signal),
    refetchInterval: QueryPolicy.reviewPollMs,
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.pageInfo.totalPages))
      setPage(Math.max(1, query.data.pageInfo.totalPages));
  }, [query.data, page]);
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) =>
      decisionsApi.reviewDecision(id, action, guildId),
    onSettled: () =>
      Promise.all(
        [
          decisionsQueryKey(guildId),
          dashboardQueryKey(guildId),
          ['decision-detail', guildId],
          ['decision-cards', guildId],
          ['review-history', guildId],
          ['review-replacements', guildId],
        ].map(queryKey => cache.invalidateQueries({ queryKey })),
      ),
  });
  const review = async (id: string, action: ReviewAction): Promise<void> => {
    await reviewWithConflictReload(
      () => mutation.mutateAsync({ id, action }),
      async () => {
        await query.refetch({ throwOnError: true });
        setRevision(value => value + 1);
      },
    );
  };
  return (
    <section>
      <AnalysisRecovery guildId={guildId} />
      <div className="flex items-center gap-3 my-4">
        <label>
          검수 상태{' '}
          <select
            aria-label="검수 상태"
            value={status}
            disabled={mutation.isPending}
            className="bg-slate-800 p-2"
            onChange={event => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="IN_REVIEW">검토 대기</option>
            <option value="ON_HOLD">보류</option>
          </select>
        </label>
        <button disabled={query.isFetching} onClick={() => void query.refetch()}>
          목록 새로고침
        </button>
      </div>
      {query.error && <p role="alert">검수 큐를 불러오지 못했습니다. {query.error.message}</p>}
      {query.data && (
        <PageControls
          page={page}
          {...query.data.pageInfo}
          onPage={setPage}
          busy={mutation.isPending}
        />
      )}
      {(!query.error || query.data) && (
        <ReviewQueue
          key={`${status}:${page}`}
          guildId={guildId}
          revision={revision}
          decisions={query.data?.items ?? []}
          records={[]}
          onReview={review}
          isLoading={query.isLoading}
        />
      )}
      <PagedReviewHistory guildId={guildId} />
    </section>
  );
}
