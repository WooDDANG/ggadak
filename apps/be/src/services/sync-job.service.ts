import { SyncJobRepository } from '../repositories/sync-job.repository.js';
import type { SyncJobView, SyncJobClaimDto } from '../dto/sync-job.dto.js';
import type { SyncChannelResult, SyncJobUpdate } from '@ggaddak/shared';
import type { SyncJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { ConflictError, NotFoundError, BadRequestError } from '../errors/AppError.js';

const view = (job: SyncJob): SyncJobView => ({
  jobId: job.id,
  guildId: job.guildId,
  forceFullSync: job.forceFullSync,
  status: job.status,
  totalChannels: job.totalChannels,
  completedChannels: job.completedChannels,
  failedChannels: job.failedChannels,
  decisionsFound: job.decisionsFound,
  messagesScanned: job.messagesScanned,
  receivedChannels: Object.values(
    JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>,
  ).filter(r => r.status === 'RECEIVED' || r.status === 'COMPLETED').length,
  channels:(JSON.parse(job.channelIdsJson) as string[]).map(id=>({id,status:(JSON.parse(job.channelResultsJson) as Record<string,SyncChannelResult>)[id]?.status??'WAITING'})),
  analysisPendingChannels: Object.values(
    JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>,
  ).filter(r => r.status === 'RECEIVED').length,
  errorMessage: job.errorMessage,
  createdAt: job.createdAt.toISOString(),
  startedAt: job.startedAt?.toISOString() ?? null,
  completedAt: job.completedAt?.toISOString() ?? null,
});

@Service()
export class SyncJobService {
  private jobs: SyncJobRepository;
  constructor(private repo: DecisionRepository) {
    this.jobs = new SyncJobRepository(repo.prisma);
  }

  async create(guildId: string, forceFullSync: boolean): Promise<SyncJobView> {
    const channels = await this.jobs.monitoredChannels(guildId);
    if (!channels.length)
      throw new BadRequestError('Select at least one monitored channel before syncing');
    const id = randomUUID();
    try {
      return await this.jobs.withTransaction(async tx => {
        const lock = await this.jobs.getLock(guildId, tx);
        if (lock) {
          const current = await this.jobs.getById(lock.jobId, tx);
          if (current && ['QUEUED', 'PROCESSING'].includes(current.status))
            throw new ConflictError('A sync is already active for this server');
          await this.jobs.releaseLock(guildId, tx);
        }
        const job = await this.jobs.create(
          {
            id,
            guildId,
            forceFullSync,
            channelIdsJson: JSON.stringify(channels.map(c => c.id)),
            totalChannels: channels.length,
          },
          tx,
        );
        await this.jobs.lockGuild(guildId, id, tx);
        return view(job);
      });
    } catch (error: any) {
      if (error?.statusCode === 409 || error?.code === 'P2002')
        throw new ConflictError('A sync is already active for this server');
      throw error;
    }
  }

  async get(jobId: string, guildId: string): Promise<SyncJobView> {
    await this.reconcile(jobId);
    const job = await this.jobs.getForGuild(jobId, guildId);
    if (!job) throw new NotFoundError('Sync Job not found');
    return view(job);
  }

  async claim(
    deliveryOnly = process.env.ANALYSIS_ASYNC_DELIVERY !== 'false' &&
      process.env.NODE_ENV !== 'test',
  ): Promise<SyncJobClaimDto | null> {
    if (deliveryOnly) {
      const active = await this.repo.prisma.syncJob.findMany({
        where: { status: 'PROCESSING' },
        select: { id: true },
        take: 100,
      });
      for (const job of active) await this.reconcile(job.id);
    }
    const now = new Date();
    const owner = randomUUID();
    const job = await this.jobs.claimNext(owner, now, new Date(now.getTime() + 120_000));
    if (!job) return null;
    const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
    return {
      ...view({ ...job, status: 'PROCESSING', startedAt: job.startedAt ?? now }),
      owner,
      ...(deliveryOnly ? { deliveryOnly: true } : {}),
      channelIds: (JSON.parse(job.channelIdsJson) as string[])
        .filter(id => (deliveryOnly ? !results[id] : results[id]?.status !== 'COMPLETED'))
        .slice(0, deliveryOnly ? 1 : undefined),
    };
  }

  async update(jobId: string, update: SyncJobUpdate): Promise<void> {
    await this.jobs.withTransaction(async tx => {
      const job = await this.jobs.getById(jobId, tx);
      if (!job) throw new NotFoundError('Sync Job not found');
      if (!update.owner || job.owner !== update.owner)
        throw new ConflictError('Sync worker lost its lease');
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return;
      if (job.status !== 'PROCESSING' || !job.leaseUntil || job.leaseUntil <= new Date())
        throw new ConflictError('Sync worker lost its lease');
      const channelIds = JSON.parse(job.channelIdsJson) as string[];
      const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
      const result = update.channelResult;
      if (result) {
        if (
          !channelIds.includes(result.channelId) ||
          !['COMPLETED', 'FAILED', 'RECEIVED'].includes(result.status) ||
          !Number.isSafeInteger(result.messagesScanned) ||
          result.messagesScanned < 0 ||
          !Number.isSafeInteger(result.decisionsFound) ||
          result.decisionsFound < 0
        )
          throw new BadRequestError('Invalid channel result');
        if (result.status === 'RECEIVED') {
          const scan = await tx.analysisScan.findFirst({
            where: { jobId, channelId: result.channelId, state: 'sealed' },
          });
          if (!scan) throw new ConflictError('Channel has not been durably received');
          const current = channelIds.find(id => !results[id]);
          if (current !== result.channelId && !results[result.channelId])
            throw new ConflictError('Channel is not the current transfer');
        }
        results[result.channelId] = result;
      }
      const values = Object.values(results);
      const completedChannels = values.filter(item => item.status === 'COMPLETED').length;
      const failedChannels = values.filter(item => item.status === 'FAILED').length;
      const terminal = update.status === 'COMPLETED' || update.status === 'FAILED' || (update.release===true&&values.length===channelIds.length&&values.every(r=>r.status!=='RECEIVED'));
      if (
        terminal &&
        (values.length !== channelIds.length || values.some(r => r.status === 'RECEIVED'))
      )
        throw new ConflictError('Sync still has unfinished channels');
      const status = terminal ? (failedChannels ? 'FAILED' : 'COMPLETED') : 'PROCESSING';
      const saved = await this.jobs.writeClaimed(
        jobId,
        update.owner,
        new Date(),
        {
          channelResultsJson: JSON.stringify(results),
          completedChannels,
          failedChannels,
          messagesScanned: values.reduce((sum, item) => sum + item.messagesScanned, 0),
          decisionsFound: values.reduce((sum, item) => sum + item.decisionsFound, 0),
          status,
          errorMessage:
            terminal && failedChannels
              ? values
                  .filter(item => item.status === 'FAILED')
                  .map(item => item.errorMessage ?? `${item.channelId}: scan failed`)
                  .join('; ')
              : null,
          ...(update.release ? { owner: null } : {}),
          leaseUntil: terminal
            ? null
            : update.release
              ? new Date(0)
              : new Date(Date.now() + 120_000),
          completedAt: terminal ? new Date() : null,
        },
        tx,
      );
      if (!saved) throw new ConflictError('Sync worker lost its lease');
      if (terminal) await this.jobs.releaseLock(job.guildId, tx, jobId);
    });
  }
  async reconcile(jobId: string): Promise<void> {
    await this.repo.prisma.$transaction(async tx => {
      const job = await tx.syncJob.findUnique({ where: { id: jobId } });
      if (!job || job.status !== 'PROCESSING') return;
      // Fence against a concurrent Bot progress update before deriving persisted results.
      await tx.syncJob.update({ where: { id: jobId }, data: { status: job.status } });
      const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
      let changed = false;
      for (const channelId of Object.keys(results)) {
        if (results[channelId].status !== 'RECEIVED') continue;
        const scan = await tx.analysisScan.findFirst({
          where: { jobId, channelId, state: 'sealed' },
        });
        if (!scan) continue;
        const rows = await tx.analysisReceipt.findMany({ where: { scanId: scan.id } });
        if (rows.some(r => !['completed', 'failed'].includes(r.state))) continue;
        const failed = rows.some(r => r.state === 'failed');
        let decisions = 0;
        for (const row of rows) {
          const a = await tx.analysisRequest.findUnique({ where: { id: row.id } });
          if (a?.resultJson) decisions += JSON.parse(a.resultJson).decisions.length;
        }
        results[channelId] = {
          ...results[channelId],
          status: failed ? 'FAILED' : 'COMPLETED',
          decisionsFound: decisions,
          ...(failed ? { errorMessage: 'Analysis failure retained; retry from recovery' } : {}),
        };
        changed = true;
      }
      if (!changed) return;
      const values = Object.values(results),
        done = values.filter(r => r.status === 'COMPLETED').length,
        failed = values.filter(r => r.status === 'FAILED').length;
      const terminal = done + failed === job.totalChannels;
      await tx.syncJob.update({
        where: { id: jobId },
        data: {
          channelResultsJson: JSON.stringify(results),
          completedChannels: done,
          failedChannels: failed,
          decisionsFound: values.reduce((n, r) => n + r.decisionsFound, 0),
          ...(terminal
            ? {
                status: failed ? 'FAILED' : 'COMPLETED',
                completedAt: new Date(),
                owner: null,
                leaseUntil: null,
                errorMessage: failed
                  ? 'Some channels failed; retained inputs can be retried'
                  : null,
              }
            : {}),
        },
      });
      if (terminal) await tx.syncJobLock.deleteMany({ where: { jobId } });
    });
  }
  async resume(jobId:string,guildId:string,channelId:string):Promise<SyncJobView>{
    await this.repo.prisma.$transaction(async tx=>{
      const job=await tx.syncJob.findFirst({where:{id:jobId,guildId}});if(!job)throw new NotFoundError('Sync Job not found');
      if(!['COMPLETED','FAILED'].includes(job.status))throw new ConflictError('Wait for the current transfer to finish');
      const lock=await tx.syncJobLock.findUnique({where:{guildId}});if(lock&&lock.jobId!==jobId)throw new ConflictError('Another scan is active');
      const results=JSON.parse(job.channelResultsJson) as Record<string,SyncChannelResult>;
      if(results[channelId]?.status!=='FAILED')throw new ConflictError('Only failed channel transfers can resume');
      const scan=await tx.analysisScan.findFirst({where:{jobId,channelId}});
      if(scan?.state==='sealed')throw new ConflictError('Data already received; retry analysis from recovery');
      delete results[channelId];
      await tx.syncJob.update({where:{id:jobId},data:{status:'QUEUED',owner:null,leaseUntil:null,completedAt:null,errorMessage:null,channelResultsJson:JSON.stringify(results),failedChannels:Object.values(results).filter(r=>r.status==='FAILED').length}});
      await tx.syncJobLock.upsert({where:{guildId},create:{guildId,jobId},update:{jobId}});
    });
    return this.get(jobId,guildId);
  }
}
