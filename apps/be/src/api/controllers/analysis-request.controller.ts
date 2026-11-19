import { Controller, Route, Tags, Get, Post, Query, Security, Request, Path, Response } from 'tsoa';
import { Service } from 'typedi';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from '../../services/auth.service.js';
import { AnalysisQueryService } from '../../services/analysis-query.service.js';
import { requirePrincipal } from '../guards/authorization.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import type { AnalysisStatus } from '../../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../../domain/decision-graph.js';
import { hash } from '../../domain/analysis-identity.js';
import { HttpDiscordChannelsAdapter } from '../../adapters/discord-channels.adapter.js';
import { AnalysisQueueService } from '../../services/analysis-queue.service.js';
import type { ReceiptView } from '../../dto/analysis-queue.dto.js';
import { ConflictError } from '../../errors/AppError.js';

@Tags('Analysis Requests')
@Route('api/v1/analysis-requests')
@Security('jwt')
@Service()
export class AnalysisRequestController extends Controller {
  constructor(
    private service: AnalysisQueryService,
    private auth: AuthService,
    private queue: AnalysisQueueService,
    private discord = new HttpDiscordChannelsAdapter(),
  ) {
    super();
  }
  @Post('{requestId}/sessions/{sessionId}/reanalyze-current')
  async reanalyzeCurrent(
    @Request() request: ExpressRequest,
    @Path() requestId: string,
    @Path() sessionId: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<ReceiptView>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId, true);
    const source = await this.service.expiredSessionSource(requestId, sessionId, guildId);
    const messages = await this.discord.readMessages(guildId, source.channelId, source.messageIds);
    if (!messages.length) throw new ConflictError('Discord에 분석할 메시지가 남아 있지 않습니다.');
    const freshRequestId = 'current-' + hash({ requestId, sessionId, messages });
    return apiSuccess(
      await this.queue.receive({
        input: {
          requestId: freshRequestId,
          guildId,
          channelId: source.channelId,
          rawMessages: messages,
        },
      }),
    );
  }
  @Post('{requestId}/sessions/{sessionId}/retry')
  async retrySession(
    @Request() request: ExpressRequest,
    @Path() requestId: string,
    @Path() sessionId: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<AnalysisStatus>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId, true);
    return apiSuccess(await this.service.scheduleRecovery(requestId, sessionId, guildId));
  }
  @Get('{requestId}/graph')
  @Response<ApiResponse<null>>(401, 'Authentication required')
  @Response<ApiResponse<null>>(403, 'Guild access denied')
  @Response<ApiResponse<null>>(404, 'Request or legacy graph unavailable')
  @Response<ApiResponse<null>>(409, 'Analysis not completed')
  @Response<ApiResponse<null>>(422, 'Terminal analysis failure')
  async graph(
    @Request() request: ExpressRequest,
    @Path() requestId: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<GraphSnapshot>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    return apiSuccess(await this.service.getGraph(requestId, guildId));
  }
  @Get('{requestId}')
  @Response<ApiResponse<null>>(401, 'Authentication required')
  @Response<ApiResponse<null>>(403, 'Guild access denied')
  @Response<ApiResponse<null>>(404, 'Request unavailable')
  async status(
    @Request() request: ExpressRequest,
    @Path() requestId: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<AnalysisStatus>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    return apiSuccess(await this.service.getStatus(requestId, guildId));
  }
}
