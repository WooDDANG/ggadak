import { dashboardQueryKey } from '../api/dashboard.api';
import { decisionsQueryKey } from '../api/session';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create as createSyncJob, get as getSyncJob, resumeChannel } from '../api/generated';
import type { SyncJobView } from '../api/generated/model';
type SyncJob = SyncJobView & { status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' };

export function ManualSync({ guildId }: { guildId: string }) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<SyncJob | null>(null);
  const [forceFullSync, setForceFullSync] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await createSyncJob({ forceFullSync }, { guildId });
      if (result.status !== 202 || !result.data.success)
        throw new Error(result.data.message || `HTTP ${result.status}`);
      return result.data.data as SyncJob;
    },
    onSuccess: job => {
      setJob(job);
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey(guildId) });
    },
  });
  const status = useQuery({
    queryKey: ['sync-job', guildId, job?.jobId],
    enabled: Boolean(job && (job.status === 'QUEUED' || job.status === 'PROCESSING')),
    queryFn: async () => {
      const result = await getSyncJob(job!.jobId, { guildId });
      if (result.status !== 200 || !result.data.success)
        throw new Error(result.data.message || `HTTP ${result.status}`);
      if (['COMPLETED', 'FAILED'].includes(result.data.data.status)) {
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey(guildId) });
        queryClient.invalidateQueries({ queryKey: decisionsQueryKey(guildId) });
        queryClient.invalidateQueries({ queryKey: ['review-queue', guildId] });
      }
      return result.data.data as SyncJob;
    },
    refetchInterval: 1500,
  });
  const current = status.data ?? job;
  const pending = current?.status === 'QUEUED' || current?.status === 'PROCESSING';
  const resume=useMutation({
    mutationFn:async(channelId:string)=>{
      const response=await resumeChannel(current!.jobId,channelId,{guildId});
      return response.data.data as SyncJob;
    },
    onSuccess:updated=>{setJob(updated);queryClient.setQueryData(['sync-job',guildId,updated.jobId],updated);},
  });
  return (
    <section className="max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">Discord 수동 동기화</h1>
      <p>
        저장된 모니터링 채널을 분석하고 새 Decision Candidate를 Review Queue에 추가합니다. Sync
        Job은 백그라운드에서 진행되며 이 화면에서 상태를 확인할 수 있습니다.
      </p>
      <label className="flex gap-3 items-start">
        <input
          type="checkbox"
          checked={forceFullSync}
          disabled={pending || mutation.isPending}
          onChange={event => setForceFullSync(event.target.checked)}
        />
        <span>
          <strong>전체 기록 강제 재분석</strong>
          <br />
          <small className="text-slate-400">
            체크포인트를 무시해 전체 기록을 분석합니다. 새 Analysis Request로 실행되며 폐기된 근거
            억제를 우회합니다.
          </small>
        </span>
      </label>
      <button
        className="bg-indigo-600 rounded px-4 py-2 disabled:opacity-50"
        disabled={pending || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? '요청 중…' : '동기화 시작'}
      </button>
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      {status.error && <p role="alert">작업 상태를 불러오지 못했습니다. {status.error.message}</p>}
      {current && (
        <div className="rounded border border-slate-700 p-4 space-y-2" aria-live="polite">
          <p role="status">
            {current.status === 'QUEUED'
              ? '봇이 작업을 시작하기를 기다리는 중입니다.'
              : current.status === 'PROCESSING'
                ? '동기화 진행 중입니다.'
                : current.status === 'COMPLETED'
                  ? '동기화가 완료되었습니다.'
                  : '동기화에 실패했습니다.'}
          </p>
          <p>
            채널 {current.completedChannels}/{current.totalChannels} 완료 · 메시지{' '}
            {current.messagesScanned}개 · Decision Candidate {current.decisionsFound}개
          </p>
          {current.receivedChannels !== undefined && (
            <p>
              데이터 수신 {current.receivedChannels}/{current.totalChannels}채널 · 분석 대기/진행{' '}
              {current.analysisPendingChannels ?? 0}채널
            </p>
          )}
          {current.errorMessage && (
            <p role="alert" className="text-rose-300">
              {current.errorMessage}
            </p>
          )}
          {current.status === 'FAILED' && (
            <p>
              완료된 채널의 후보는 Review Queue에서 확인할 수 있습니다. 데이터 전달 실패는 아래에서 재개하고, 분석 실패는 분석 복구 화면에서 재시도하세요.
            </p>
          )}
        </div>
      )}
      {current?.status==='FAILED'&&current.channels?.filter(c=>c.status==='FAILED').map(channel=><button key={channel.id} className="bg-indigo-600 rounded px-3 py-2 disabled:opacity-50" disabled={resume.isPending} onClick={()=>resume.mutate(channel.id)}>채널 {channel.id} 데이터 전달 재개</button>)}
      {resume.error&&<p role="alert">{resume.error.message}</p>}
    </section>
  );
}
