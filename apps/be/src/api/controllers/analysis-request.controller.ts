import { Controller, Route, Tags, Get, Query, Security, Request, Path, Response } from 'tsoa';
import { Service } from 'typedi';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from '../../services/auth.service.js';
import { DiscussionService } from '../../services/discussion.service.js';
import { requirePrincipal } from '../guards/authorization.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import type { AnalysisStatus } from '../../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../../domain/decision-graph.js';

@Tags('Analysis Requests')
@Route('api/v1/analysis-requests')
@Security('jwt')
@Service()
export class AnalysisRequestController extends Controller {
  constructor(
    private service: DiscussionService,
    private auth: AuthService,
  ) {
    super();
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
