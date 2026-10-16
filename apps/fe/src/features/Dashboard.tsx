import { QueryPolicy } from '../config';
import { SyncJobStatus } from '@ggaddak/shared';
import { useQuery } from '@tanstack/react-query';
import { loadDashboard, dashboardQueryKey } from '../api/dashboard.api';
export function Dashboard({ guildId }: { guildId: string }) {
  const query = useQuery({
    queryKey: dashboardQueryKey(guildId),
    queryFn: () => loadDashboard(guildId),
    refetchInterval: QueryPolicy.dashboardPollMs,
  });
  if (query.isLoading) return <p role="status">대시보드 불러오는 중...</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  const data = query.data!;
  const job = data.sync.latestJob;
  const state =
    job?.status === SyncJobStatus.Queued
      ? '동기화 대기 중'
      : job?.status === SyncJobStatus.Processing
        ? '동기화 진행 중'
        : job?.status === SyncJobStatus.Failed
          ? '동기화 실패'
          : job?.status === SyncJobStatus.Completed
            ? '동기화 완료'
            : '동기화 기록 없음';
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold">서버 대시보드</h1>
      <div className="flex flex-wrap gap-5">
        <p>확정 {data.counts.confirmed}건</p>
        <p>보류 {data.counts.onHold}건</p>
        <p>검수 대기 {data.counts.inReview}건</p>
      </div>
      <div className="rounded bg-slate-800 p-4 space-y-2">
        <p role="status">{state}</p>
        <p>
          마지막 성공 동기화:{' '}
          {data.sync.lastSuccessfulAt
            ? new Date(data.sync.lastSuccessfulAt).toLocaleString()
            : '기록 없음'}
        </p>
        {job && (
          <p>
            완료 채널 {job.completedChannels}/{job.totalChannels} · 실패 {job.failedChannels}
          </p>
        )}
        {job?.errorMessage && <p role="alert">{job.errorMessage}</p>}
      </div>
      <h2>최근 확정 결정</h2>
      {data.recentDecisions.length === 0 && <p>확정된 결정이 없습니다.</p>}
      {data.recentDecisions.map(card => (
        <article className="rounded bg-slate-800 p-4" key={card.id}>
          <h3>{card.title || card.topic}</h3>
          <p>{card.decisionContent || card.decision}</p>
          <p>{card.rationaleSummary || card.rationale}</p>
          <p>
            {card.confirmedDate ? new Date(card.confirmedDate).toLocaleString() : '확정일 미기록'}
          </p>
        </article>
      ))}
    </section>
  );
}
