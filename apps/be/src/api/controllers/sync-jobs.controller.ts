import type { Request as ExpressRequest } from 'express';
import { Controller, Route, Tags, Post, Get, Put, Query, Path, Body, Request, Security, SuccessResponse } from 'tsoa';
import { Service } from 'typedi';
import { AuthService } from '../../services/auth.service.js';
import { SyncJobService, SyncJobView } from '../../services/sync-job.service.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';

@Tags('v1 Sync Jobs')
@Route('api/v1/sync-jobs')
@Security('jwt')
@Service()
export class SyncJobsController extends Controller {
  constructor(private jobs: SyncJobService, private auth: AuthService) { super(); }

  @Post()
  @SuccessResponse('202', 'Sync Job accepted')
  public async create(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Body() body: { forceFullSync?: boolean },
  ): Promise<ApiResponse<SyncJobView>> {
    await this.auth.requireGuild(request.user!, guildId, true);
    const job = await this.jobs.create(guildId, body.forceFullSync === true);
    this.setStatus(202);
    return apiSuccess(job);
  }

  @Get('{jobId}')
  public async get(
    @Request() request: ExpressRequest,
    @Path() jobId: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<SyncJobView>> {
    await this.auth.requireGuild(request.user!, guildId);
    return apiSuccess(await this.jobs.get(jobId, guildId));
  }
}

@Tags('Internal Sync Jobs')
@Route('api/v1/internal/sync-jobs')
@Security('service')
@Service()
export class InternalSyncJobsController extends Controller {
  constructor(private jobs: SyncJobService) { super(); }

  @Post('claim')
  public async claim(): Promise<ApiResponse<any | null>> { return apiSuccess(await this.jobs.claim()); }

  @Put('{jobId}')
  public async update(
    @Path() jobId: string,
    @Body() body: { completedChannels?: number; failedChannels?: number; decisionsFound?: number; messagesScanned?: number; errorMessage?: string | null; status?: 'PROCESSING' | 'COMPLETED' | 'FAILED' },
  ): Promise<ApiResponse<null>> { await this.jobs.update(jobId, body); return apiSuccess(null); }
}
